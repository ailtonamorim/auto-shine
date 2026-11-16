document.addEventListener('DOMContentLoaded', () => {
    // Interação simples e moderna para o menu mobile
    const menuBtn = document.getElementById('menu-btn');
    const navLinks = document.getElementById('nav-links');

    if(menuBtn) {
        menuBtn.addEventListener('click', () => {
            // Em uma implementação real, você adicionaria uma classe '.active' 
            // no CSS para deslizar o menu na tela.
            alert("Abrir menu mobile (Navegação bottom-sheet ou sidebar)");
        });
    }

    // Leve animação de fade-in ao carregar a página para sensação premium
    const heroLeft = document.querySelector('.hero-left');
    const heroRight = document.querySelector('.hero-right');
    const carImage = document.querySelector('.car-wrapper');

    // Estado inicial
    heroLeft.style.opacity = '0';
    heroRight.style.opacity = '0';
    heroLeft.style.transform = 'translateY(20px)';
    heroRight.style.transform = 'translateY(20px)';

    // Gatilho de animação após carregar
    setTimeout(() => {
        heroLeft.style.transition = 'all 0.8s ease';
        heroLeft.style.opacity = '1';
        heroLeft.style.transform = 'translateY(0)';
        
        setTimeout(() => {
            heroRight.style.transition = 'all 0.8s ease';
            heroRight.style.opacity = '1';
            heroRight.style.transform = 'translateY(0)';
        }, 200); // Efeito cascata
    }, 100);
});