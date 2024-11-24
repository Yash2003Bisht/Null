import * as vscode from 'vscode';
import { fetchCompletion } from './utils';

interface LineBreakRule {
    pattern: RegExp;
    shouldBreak: boolean;
    indentNextLine?: boolean;
}

// Helper class to manage completion formatting
export default class CompletionFormatter {
    private static lineBreakRules: LineBreakRule[] = [
        // Import statements should be on separate lines
        {
            pattern: /^import\s+.*/,
            shouldBreak: true
        },
        // Function definitions should break after signature
        {
            pattern: /^(async\s+)?function\s*.*\)\s*{?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },
        // Class definitions should break after opening brace
        {
            pattern: /^class\s+.*{?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },
        // Method definitions should break after signature
        {
            pattern: /^\s*(async\s+)?[\w]+\s*\(.*\)\s*{?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },
        // Control statements should break after condition
        {
            pattern: /^(if|for|while|switch)\s*\(.*\)\s*{?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },
        // Line ending with operators should continue on next line
        {
            pattern: /.*[+\-*/=]\s*$/,
            shouldBreak: true
        }
    ];

    static formatCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        completionText: string
    ): { text: string; range: vscode.Range } {
        const currentLine = document.lineAt(position.line).text;
        const currentIndentation = this.getIndentation(currentLine);
        const linePrefix = currentLine.substring(0, position.character);

        // Check if we need to add a line break based on the current line
        for (const rule of this.lineBreakRules) {
            if (rule.pattern.test(linePrefix)) {
                const nextIndentation = rule.indentNextLine
                    ? this.increaseIndentation(currentIndentation)
                    : currentIndentation;

                // If completion should be on next line, format it accordingly
                if (rule.shouldBreak) {
                    const formattedCompletion = `\n${nextIndentation}${completionText.trimLeft()}`;
                    return {
                        text: formattedCompletion,
                        range: new vscode.Range(position, position)
                    };
                }
            }
        }

        // Default case: inline completion
        return {
            text: completionText,
            range: new vscode.Range(position, position)
        };
    }

    private static getIndentation(line: string): string {
        const match = line.match(/^[\s\t]*/);
        return match ? match[0] : '';
    }

    private static increaseIndentation(currentIndent: string): string {
        // Use editor's indentation settings
        const editorConfig = vscode.workspace.getConfiguration('editor');
        const insertSpaces = editorConfig.get<boolean>('insertSpaces', true);
        const tabSize = editorConfig.get<number>('tabSize', 4);

        if (insertSpaces) {
            return currentIndent + ' '.repeat(tabSize);
        } else {
            return currentIndent + '\t';
        }
    }
}
