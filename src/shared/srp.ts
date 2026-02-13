/**
 * SRP (Secure Remote Password) verification flow.
 * Adapted from ente/web/packages/accounts/services/srp.ts.
 */
import { SRP, SrpClient } from "fast-srp-hap";
import { deriveSubKeyBytes, toB64 } from "./crypto";
import type { SRPAttributes, SRPVerificationResponse } from "./types";

const b64ToBuffer = (base64: string) => Buffer.from(base64, "base64");
const bufferToB64 = (buffer: Buffer) => buffer.toString("base64");

/**
 * Derive a login sub-key from the KEK for use as the SRP password.
 * Takes the first 16 bytes of a 32-byte KDF subkey derived with context "loginctx".
 */
const deriveSRPLoginSubKey = async (kek: string): Promise<string> => {
    const kekSubKeyBytes = await deriveSubKeyBytes(kek, 32, 1, "loginctx");
    return toB64(kekSubKeyBytes.slice(0, 16));
};

/**
 * Generate an SRP client instance with random ephemeral key.
 */
const generateSRPClient = async (
    srpSalt: string,
    srpUserID: string,
    loginSubKey: string,
): Promise<SrpClient> =>
    new Promise<SrpClient>((resolve, reject) => {
        SRP.genKey((err, clientKey) => {
            if (err) reject(err);
            resolve(
                new SrpClient(
                    SRP.params["4096"],
                    b64ToBuffer(srpSalt),
                    Buffer.from(srpUserID),
                    b64ToBuffer(loginSubKey),
                    clientKey!,
                    false,
                ),
            );
        });
    });

/**
 * Perform SRP verification against the Ente API.
 *
 * @param apiUrl The base API URL.
 * @param srpAttributes The user's SRP attributes from the server.
 * @param kek The user's key encryption key (base64).
 * @returns The SRP verification response containing token/encryptedToken, keyAttributes, etc.
 */
export const verifySRP = async (
    apiUrl: string,
    srpAttributes: SRPAttributes,
    kek: string,
): Promise<SRPVerificationResponse> => {
    const { srpUserID, srpSalt } = srpAttributes;

    const loginSubKey = await deriveSRPLoginSubKey(kek);
    const srpClient = await generateSRPClient(srpSalt, srpUserID, loginSubKey);

    // Step 1: Send A, obtain B and sessionID
    const srpA = bufferToB64(srpClient.computeA());
    const createSessionRes = await fetch(`${apiUrl}/users/srp/create-session`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Client-Package": "io.ente.auth.web",
        },
        body: JSON.stringify({ srpUserID, srpA }),
    });
    if (!createSessionRes.ok) {
        const errText = await createSessionRes.text();
        throw new Error(`SRP create-session failed (${createSessionRes.status}): ${errText}`);
    }
    const { sessionID, srpB } = (await createSessionRes.json()) as {
        sessionID: string;
        srpB: string;
    };

    // Step 2: Set B on client, compute M1
    srpClient.setB(b64ToBuffer(srpB));
    const srpM1 = bufferToB64(srpClient.computeM1());

    // Step 3: Send M1, obtain M2 and rest of the response
    const verifySessionRes = await fetch(`${apiUrl}/users/srp/verify-session`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Client-Package": "io.ente.auth.web",
        },
        body: JSON.stringify({ sessionID, srpUserID, srpM1 }),
    });
    if (verifySessionRes.status === 401) {
        throw new Error("Incorrect password");
    }
    if (!verifySessionRes.ok) {
        const errText = await verifySessionRes.text();
        throw new Error(`SRP verify-session failed (${verifySessionRes.status}): ${errText}`);
    }

    const response = (await verifySessionRes.json()) as SRPVerificationResponse;

    // Step 4: Verify server's M2
    srpClient.checkM2(b64ToBuffer(response.srpM2));

    return response;
};
