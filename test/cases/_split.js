// Tiny auto-advance for split inputs so they behave like real ones.
document.querySelectorAll('.split').forEach((group) => {
    const inputs = Array.from(group.querySelectorAll('input'));
    inputs.forEach((input, i) => {
        input.addEventListener('input', () => {
            if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
        });
    });
});
