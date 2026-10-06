// Configure custom Tailwind colors dynamically to match project palette
tailwind.config = {
    theme: {
        extend: {
            colors: {
                forest: {
                    800: '#2d5a27',
                    900: '#1e3d1a',
                    950: '#0f200d',
                },
                terracotta: {
                    500: '#e07a5f',
                    600: '#d15d3d',
                }
            }
        }
    }
};