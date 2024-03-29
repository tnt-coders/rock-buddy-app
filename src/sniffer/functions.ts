// Handles an error and displays it on screen
export function showError(error: any): void {
    if (error instanceof Error) {
        const p = document.createElement('p');
        p.innerHTML = error.message;
        const errorElement = document.getElementById('error');

        if (errorElement !== null) {
            errorElement.innerHTML = '';
            errorElement.appendChild(p);
            showExclusive('group1', 'error');
        }
        else {
            console.error(error.message);
        }
    }
    else {
        throw error;
    }
}

// Gets all elements with the provided group class
// Shows all that have the provided name class
// Hides all that don't have the name class
export function showExclusive(group: string, name: string): void {
    const elements = document.querySelectorAll('.' + group);
    elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.classList.contains(name)) {
            if (htmlElement.classList.contains('inline')) {
                htmlElement.style.display = 'inline-block';
            }
            else {
                htmlElement.style.display = 'block';
            }
        }
        else {
            htmlElement.style.display = 'none';
        }
    });
}