import * as vscode from 'vscode';

export interface UserContext {
    recentLines: string[]; // Tracks the last 100–250 lines of code
    acceptedSuggestions: string[]; // Tracks accepted autocomplete suggestions
    surroundingContext: string; // Code 30–50 lines above and below cursor
}

/**
 * Class to manage and update context awareness.
 */
export class ContextAwareness {
    private slidingWindow: string[] = []; // Stores lines of code in a sliding window
    private acceptedSuggestions: string[] = []; // Stores accepted autocomplete suggestions
    private maxWindowSize: number = 250; // Maximum number of lines to store in sliding window

    /**
     * Updates the sliding window with the latest editor content.
     * Tracks up to `maxWindowSize` lines of code.
     */
    private updateSlidingWindow() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const lines = activeEditor.document.getText().split('\n'); // Split document into lines
        const startLine = Math.max(0, lines.length - this.maxWindowSize);

        // Keep only the last `maxWindowSize` lines
        this.slidingWindow = lines.slice(startLine);
    }

    /**
     * Tracks an accepted autocomplete suggestion.
     * @param suggestion The suggestion the user accepted.
     */
    public trackAcceptedSuggestion(suggestion: string) {
        this.acceptedSuggestions.push(suggestion);
    }

    /**
     * Fetches the code around the user's cursor dynamically (30–50 lines).
     * Adjusts based on function, loop, or code block boundaries.
     */
    private getSurroundingContext(): string {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return '';

        const cursorPosition = activeEditor.selection.active;
        const totalLines = activeEditor.document.lineCount;

        const startLine = Math.max(0, cursorPosition.line - 25);
        const endLine = Math.min(totalLines, cursorPosition.line + 25);

        return activeEditor.document.getText(
            new vscode.Range(startLine, 0, endLine, 0)
        );
    }

    /**
     * Updates the context data and returns the current state.
     */
    public getUserContext(): UserContext {
        this.updateSlidingWindow();
        const surroundingContext = this.getSurroundingContext();

        console.log(this.slidingWindow);
        console.log(this.acceptedSuggestions);
        console.log(surroundingContext);

        return {
            recentLines: this.slidingWindow,
            acceptedSuggestions: this.acceptedSuggestions,
            surroundingContext: surroundingContext,
        };
    }
}
