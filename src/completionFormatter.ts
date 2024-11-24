import * as vscode from 'vscode';

interface LineBreakRule {
    pattern: RegExp;
    shouldBreak: boolean;
    indentNextLine?: boolean;
    language?: string[]; // Optional: specific languages where this rule applies
}

export default class CompletionFormatter {
    private static lineBreakRules: LineBreakRule[] = [
        // Import/Include/Using statements
        {
            pattern: /^(import|from|using|require|include|#include)\s+.*/,
            shouldBreak: true
        },

        // Package/Namespace declarations
        {
            pattern: /^(package|namespace)\s+.*/,
            shouldBreak: true
        },

        // Function/Method declarations (multiple languages)
        {
            pattern: /^(async\s+)?(function|func|def|fn|fun|method|sub|proc|procedure|private|public|protected|internal|override|virtual|static|final)*\s*[\w<>]+\s*\(.*\)\s*({|\:|→|->)?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Lambda/Arrow Functions
        {
            pattern: /^.*=>\s*({)?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Class/Interface/Struct/Enum declarations
        {
            pattern: /^(class|interface|struct|enum|trait|type|record|data class)\s+.*({|\:)?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Control flow statements
        {
            pattern: /^(if|else|elif|else if|for|foreach|while|do|switch|case|catch|finally|try|unless|when|match|select)\s*(\(.*\))?\s*({|\:)?\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Block starters
        {
            pattern: /^.*{[\s\r\n]*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Decorators/Attributes
        {
            pattern: /^[\s\t]*@[\w\.]+([\s\t]*\(.*\))?\s*$/,
            shouldBreak: true
        },

        // Multi-line operators
        {
            pattern: /.*[+\-*/=<>?:|&%]\s*$/,
            shouldBreak: true
        },

        // Array/List initializers
        {
            pattern: /^.*[\[\{]\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // SQL Queries
        {
            pattern: /^.*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE)\s*.*$/i,
            shouldBreak: true,
            indentNextLine: true
        },

        // Promise chains
        {
            pattern: /\.(then|catch|finally|map|filter|reduce)\(\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Builder pattern method chains
        {
            pattern: /^.*\.\w+\(\)\s*$/,
            shouldBreak: true
        },

        // HTML/XML tags
        {
            pattern: /^.*<[^>]+>\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Property/Field declarations
        {
            pattern: /^(private|public|protected|internal|static|final|const|let|var|my|our)\s+[\w<>]+\s+\w+\s*=?\s*$/,
            shouldBreak: true
        },

        // Doc comments
        {
            pattern: /^[\s\t]*(\/\*\*|###|\'\'\').*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Template literals
        {
            pattern: /^.*`\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // List comprehensions
        {
            pattern: /^.*\[\s*for\s+.*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Async/Await blocks
        {
            pattern: /^.*(async|await)\s+.*$/,
            shouldBreak: true
        },

        // Exception handling
        {
            pattern: /^(try|catch|finally|rescue|ensure|except)\s*.*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Shell script conditions
        {
            pattern: /^(if|elif|else|case|while|until|for)\s+.*;\s*do\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Python with statements
        {
            pattern: /^with\s+.*:\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Rust match patterns
        {
            pattern: /^.*=>\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Go defer/go statements
        {
            pattern: /^(defer|go)\s+.*$/,
            shouldBreak: true
        },

        // CSS/SCSS rules
        {
            pattern: /^.[^{]*{\s*$/,
            shouldBreak: true,
            indentNextLine: true
        },

        // Variable declarations with initialization
        {
            pattern: /^(var|let|const|dim|private|public|protected)\s+\w+\s*=\s*$/,
            shouldBreak: true,
            indentNextLine: true
        }
    ];

    private static languageSpecificRules: { [key: string]: LineBreakRule[] } = {
        python: [
            {
                pattern: /^def\s+\w+\s*\(.*\)\s*->\s*.*:\s*$/,
                shouldBreak: true,
                indentNextLine: true
            }
        ],
        rust: [
            {
                pattern: /^impl(\s+\w+)?\s+for\s+\w+\s*.*\s*$/,
                shouldBreak: true,
                indentNextLine: true
            }
        ],
        // Add more language-specific rules as needed
    };

    static formatCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        completionText: string
    ): { text: string; range: vscode.Range } {
        const currentLine = document.lineAt(position.line).text;
        const currentIndentation = this.getIndentation(currentLine);
        const linePrefix = currentLine.substring(0, position.character);
        const languageId = document.languageId;

        // Check language-specific rules first
        const languageRules = this.languageSpecificRules[languageId] || [];
        for (const rule of languageRules) {
            if (rule.pattern.test(linePrefix)) {
                return this.formatWithRule(rule, position, completionText, currentIndentation);
            }
        }

        // Then check general rules
        for (const rule of this.lineBreakRules) {
            if (rule.pattern.test(linePrefix)) {
                return this.formatWithRule(rule, position, completionText, currentIndentation);
            }
        }

        // Check for partial keywords and remove duplicates
        completionText = this.removeDuplicateKeywords(linePrefix, completionText);

        // Check if we need to add a line break based on the current line
        const formattedResult = this.applyFormattingRules(
            document,
            position,
            completionText,
            currentIndentation,
            linePrefix,
            languageId
        );

        // Default case: inline completion
        return formattedResult;
    }

    private static removeDuplicateKeywords(linePrefix: string, completionText: string): string {
        // Comprehensive list of keywords across popular programming languages
        const keywords = [
            // Basic programming keywords
            'def', 'class', 'function', 'fun', 'fn', 'func', 'method', 'proc', 'sub',
            'import', 'from', 'require', 'include', 'use', 'uses', 'using', 'extern',
            'public', 'private', 'protected', 'internal', 'friend', 'final', 'sealed',
            'static', 'async', 'await', 'let', 'const', 'var', 'val', 'dim', 'auto',
            'if', 'else', 'elif', 'elseif', 'unless', 'switch', 'case', 'match', 'when',
            'while', 'for', 'foreach', 'do', 'until', 'loop', 'repeat', 'continue',
            'try', 'catch', 'finally', 'rescue', 'ensure', 'except', 'raise', 'throw',
            'return', 'yield', 'break', 'next', 'goto', 'package', 'namespace',

            // Object-oriented keywords
            'interface', 'trait', 'struct', 'enum', 'record', 'type', 'typedef',
            'implements', 'extends', 'override', 'virtual', 'abstract', 'super',
            'this', 'self', 'base', 'new', 'delete', 'instanceof', 'sizeof',

            // Access modifiers
            'readonly', 'volatile', 'transient', 'synchronized', 'mutable',
            'const', 'final', 'static', 'abstract', 'export', 'default',

            // Memory/Type keywords
            'void', 'null', 'nil', 'undefined', 'None', 'true', 'false',
            'int', 'float', 'double', 'string', 'char', 'bool', 'boolean',
            'array', 'list', 'set', 'map', 'dict', 'tuple', 'vector',

            // Module/Package related
            'module', 'package', 'library', 'crate', 'gem', 'pod',
            'export', 'extern', 'from', 'as', 'into', 'impl',

            // Functional programming
            'lambda', 'where', 'select', 'group', 'by', 'having',
            'map', 'filter', 'reduce', 'fold', 'pipe', 'compose',

            // Asynchronous programming
            'async', 'await', 'promise', 'future', 'task', 'go',

            // Database/SQL
            'select', 'insert', 'update', 'delete', 'create', 'alter',
            'drop', 'table', 'view', 'index', 'trigger', 'procedure',

            // React-specific keywords
            'props', 'state', 'context', 'ref', 'key', 'children',
            'component', 'useState', 'useEffect', 'useContext', 'useRef',
            'useCallback', 'useMemo', 'useReducer', 'useLayoutEffect',
            'memo', 'forwardRef', 'Fragment', 'Suspense', 'lazy',
            'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
            'render', 'shouldComponentUpdate', 'getDerivedStateFromProps',
            'getSnapshotBeforeUpdate', 'displayName', 'defaultProps',
            'propTypes', 'contextType', 'Consumer', 'Provider',
        ];

        // Language-specific function and type definition patterns
        const functionPatterns: { [key: string]: RegExp[] } = {
            python: [
                /^(async\s+)?def\s+(\w+)/,
                /^class\s+(\w+)/,
                /^@\w+\s*(async\s+)?def\s+(\w+)/  // Decorated functions
            ],
            typescript: [
                /^(async\s+)?function\s+(\w+)/,
                /^(private|public|protected|static\s+)*(async\s+)?(\w+)\s*\(/,  // Methods
                /^interface\s+(\w+)/,
                /^type\s+(\w+)/,
                /^class\s+(\w+)/,
                /^enum\s+(\w+)/,
                /^const\s+(\w+)\s*=/,
                /^let\s+(\w+)\s*=/,
                /^var\s+(\w+)\s*=/
            ],
            javascript: [
                /^(async\s+)?function\s+(\w+)/,
                /^class\s+(\w+)/,
                /^(static\s+)?(get|set)\s+(\w+)/,  // Getters/Setters
                /^(const|let|var)\s+(\w+)\s*=/
            ],
            java: [
                /^(public|private|protected)\s+(static\s+)?(final\s+)?\w+(\s*<[^>]+>)?\s+(\w+)\s*\(/,
                /^class\s+(\w+)/,
                /^interface\s+(\w+)/,
                /^enum\s+(\w+)/,
                /^@\w+\s*(\w+)/  // Annotated methods
            ],
            kotlin: [
                /^fun\s+(\w+)/,
                /^class\s+(\w+)/,
                /^object\s+(\w+)/,
                /^interface\s+(\w+)/,
                /^data\s+class\s+(\w+)/
            ],
            rust: [
                /^fn\s+(\w+)/,
                /^struct\s+(\w+)/,
                /^enum\s+(\w+)/,
                /^trait\s+(\w+)/,
                /^impl\s+(\w+)/,
                /^type\s+(\w+)/,
                /^pub(\s*\([^\)]+\))?\s+fn\s+(\w+)/  // Public functions
            ],
            go: [
                /^func\s+(\w+)/,
                /^type\s+(\w+)/,
                /^interface\s+(\w+)/,
                /^struct\s+(\w+)/
            ],
            csharp: [
                /^(public|private|protected|internal)\s+(static\s+)?(async\s+)?\w+(\s*<[^>]+>)?\s+(\w+)\s*\(/,
                /^class\s+(\w+)/,
                /^interface\s+(\w+)/,
                /^enum\s+(\w+)/,
                /^struct\s+(\w+)/,
                /^record\s+(\w+)/,
                /^\[[\w\.]+\]\s*(\w+)/  // Attributed members
            ],
            php: [
                /^(public|private|protected)\s+(static\s+)?(function)\s+(\w+)/,
                /^class\s+(\w+)/,
                /^interface\s+(\w+)/,
                /^trait\s+(\w+)/,
                /^namespace\s+(\w+)/
            ],
            swift: [
                /^func\s+(\w+)/,
                /^class\s+(\w+)/,
                /^struct\s+(\w+)/,
                /^enum\s+(\w+)/,
                /^protocol\s+(\w+)/,
                /^extension\s+(\w+)/
            ],
            ruby: [
                /^def\s+(\w+)/,
                /^class\s+(\w+)/,
                /^module\s+(\w+)/,
                /^attr_\w+\s+:(\w+)/
            ],
            scala: [
                /^def\s+(\w+)/,
                /^class\s+(\w+)/,
                /^object\s+(\w+)/,
                /^trait\s+(\w+)/,
                /^type\s+(\w+)/,
                /^case\s+class\s+(\w+)/
            ],
            react: [
                // Function Components
                /^(function|const)\s+(\w+)\s*:\s*(React\.)?FC(\<[^>]+\>)?/,
                /^(function|const)\s+(\w+)\s*:\s*(React\.)?FunctionComponent(\<[^>]+\>)?/,
                /^(export\s+)?(function|const)\s+(\w+)\s*=\s*\(\s*props\s*:\s*[^)]*\)\s*=>/,
                // Class Components
                /^class\s+(\w+)\s+extends\s+(React\.)?Component/,
                /^class\s+(\w+)\s+extends\s+(React\.)?PureComponent/,
                // Hooks
                /^const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/,
                /^const\s+(\w+)\s*=\s*useRef/,
                /^const\s+(\w+)\s*=\s*useMemo/,
                /^const\s+(\w+)\s*=\s*useCallback/,
                /^const\s+(\w+)\s*=\s*useContext/,
                // Custom Hooks
                /^(function|const)\s+use(\w+)/,
                // Higher Order Components
                /^const\s+(\w+)\s*=\s*withRouter/,
                /^const\s+(\w+)\s*=\s*connect/
            ],
            dart: [
                // Classes and constructors
                /^class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w\s,]+)?/,
                /^abstract\s+class\s+(\w+)/,
                /^mixin\s+(\w+)/,
                /^extension\s+(\w+)\s+on\s+\w+/,
                // Functions and methods
                /^(async\s+)?(\w+\s+)?(\w+)\s*\([^)]*\)\s*(async\s*)?\{/,
                /^(get|set)\s+(\w+)/,
                // Factory constructors
                /^factory\s+(\w+)/,
                // Named constructors
                /^(\w+)\.(\w+)/,
                // Variables and fields
                /^(final|const|var|late)\s+(\w+)/,
                // Flutter specific widgets
                /^class\s+(\w+)\s+extends\s+(StatelessWidget|StatefulWidget)/,
                /^class\s+_?(\w+)State\s+extends\s+State/
            ]
        };

        const trimmedPrefix = linePrefix.trim();
        const trimmedCompletion = completionText.trim();

        // Handle function definitions with partial matches
        for (const [_, patterns] of Object.entries(functionPatterns)) {
            for (const pattern of patterns) {
                const prefixMatch = trimmedPrefix.match(pattern);
                if (prefixMatch) {
                    const identifierName = prefixMatch[prefixMatch.length - 1]; // Get the identifier name
                    // Check if completion starts with the same pattern and identifier
                    const completionMatch = trimmedCompletion.match(pattern);
                    if (completionMatch && completionMatch[completionMatch.length - 1] === identifierName) {
                        // Remove everything up to and including the identifier from the prefix
                        return trimmedCompletion.slice(prefixMatch[0].length).trimLeft();
                    }
                }
            }
        }

        // Handle partial word completions with more context
        const partialWordMatch = trimmedPrefix.match(/\b([\w_]+)$/);
        if (partialWordMatch) {
            const partialWord = partialWordMatch[1];
            if (trimmedCompletion.startsWith(partialWord)) {
                // Only remove the partial word if what follows would complete it
                const followingText = trimmedCompletion.slice(partialWord.length);
                if (followingText.match(/^[\w_<>[\](){}]/)) {
                    return followingText;
                }
            }
        }

        // Check for common keyword duplicates
        for (const keyword of keywords) {
            const keywordRegex = new RegExp(`\\b${keyword}\\b\\s*$`);
            if (keywordRegex.test(trimmedPrefix)) {
                // If the completion starts with the same keyword, remove it
                const duplicateKeywordRegex = new RegExp(`^\\s*${keyword}\\b`);
                if (duplicateKeywordRegex.test(trimmedCompletion)) {
                    return trimmedCompletion.replace(duplicateKeywordRegex, '').trim();
                }
            }
        }

        return completionText;
    }

    private static applyFormattingRules(
        document: vscode.TextDocument,
        position: vscode.Position,
        completionText: string,
        currentIndentation: string,
        linePrefix: string,
        languageId: string
    ): { text: string; range: vscode.Range } {
        // Get the syntax tree if available (for more accurate completions)
        const precedingText = document.getText(new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 10), 0),
            position
        ));

        // Detect context to avoid duplicate code
        const context = this.detectContext(precedingText, linePrefix, languageId);

        // Adjust completion based on context
        if (context.isPartialDefinition) {
            completionText = this.adjustCompletionForPartialDefinition(
                completionText,
                context.partialKeyword || ''
            );
        }

        // Apply indentation and line break rules
        const shouldAddLineBreak = this.shouldAddLineBreak(linePrefix, languageId);
        const nextIndentation = shouldAddLineBreak ?
            this.increaseIndentation(currentIndentation) :
            currentIndentation;

        const formattedText = shouldAddLineBreak ?
            `\n${nextIndentation}${completionText}` :
            completionText;

        return {
            text: formattedText,
            range: new vscode.Range(position, position)
        };
    }

    private static shouldAddLineBreak(linePrefix: string, languageId: string): boolean {
        // First check language-specific patterns
        const languagePatterns: { [key: string]: RegExp[] } = {
            python: [
                /^(async\s+)?def\s+\w+\s*\([^)]*\)\s*(->\s*[^:]+)?\s*:\s*$/,  // Python function definitions
                /^class\s+\w+(\s*\([^)]*\))?\s*:\s*$/,  // Python class definitions
                /^(if|elif|else|for|while|with|try|except|finally)\s*.*:\s*$/  // Python control structures
            ],
            typescript: [
                /^interface\s+\w+\s*$/,  // TypeScript interface declarations
                /^type\s+\w+\s*=\s*$/,   // TypeScript type declarations
                /=>\s*$/                 // Arrow function expressions
            ],
            javascript: [
                /=>\s*$/,               // Arrow function expressions
                /\{\s*$/,               // Object literal or block start
                /\[\s*$/                // Array literal start
            ]
        };

        // Check language-specific patterns first
        const languageSpecificPatterns = languagePatterns[languageId];
        if (languageSpecificPatterns) {
            for (const pattern of languageSpecificPatterns) {
                if (pattern.test(linePrefix.trim())) {
                    return true;
                }
            }
        }

        // General patterns that apply to most languages
        const generalPatterns: RegExp[] = [
            // Block-starting brackets
            /[{(\[]\s*$/,

            // Multi-line chaining
            /\.\w+\(\)\s*$/,

            // Multi-line string concatenation or operations
            /[+\-*/%&|^]=?\s*$/,

            // SQL keywords
            /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|GROUP BY|ORDER BY|HAVING)\s*$/i,

            // Common programming constructs
            /^(if|for|while|switch|catch|function|class|interface|namespace)\s+.*$/,

            // Method/Function declarations
            /^(public|private|protected|static|async)\s+(function|method|void|[\w<>]+)\s+\w+\s*\([^)]*\)\s*$/,

            // Decorator/Attribute patterns
            /^@\w+(\s*\([^)]*\))?\s*$/,

            // Promise chains
            /\.(then|catch|finally)\(\s*$/,

            // Template literal starts
            /`[^`]*$/,

            // Comment blocks
            /\/\*\*\s*$/,

            // HTML/XML tags
            /<[^>]+>\s*$/,

            // Variable declarations with initialization
            /^(const|let|var)\s+\w+\s*=\s*$/
        ];

        // Check if any general pattern matches
        for (const pattern of generalPatterns) {
            if (pattern.test(linePrefix.trim())) {
                return true;
            }
        }

        // Check for incomplete brackets/parentheses balance
        const openBrackets = (linePrefix.match(/[{(\[]/g) || []).length;
        const closeBrackets = (linePrefix.match(/[})\]]/g) || []).length;
        if (openBrackets > closeBrackets) {
            return true;
        }

        // Check line length to encourage breaking long lines
        const maxLineLength = 100; // This could be made configurable
        if (linePrefix.length > maxLineLength) {
            return true;
        }

        return false;
    }

    private static detectContext(
        precedingText: string,
        linePrefix: string,
        languageId: string
    ): {
        isPartialDefinition: boolean;
        partialKeyword: string | null;
        context: string;
    } {
        const lastLine = linePrefix.trim();
        const partialKeywordMatch = lastLine.match(/\b(\w+)$/);

        return {
            isPartialDefinition: !!partialKeywordMatch,
            partialKeyword: partialKeywordMatch ? partialKeywordMatch[1] : null,
            context: this.determineContext(precedingText, languageId)
        };
    }

    private static adjustCompletionForPartialDefinition(
        completion: string,
        partialKeyword: string
    ): string {
        // If we're completing a partial keyword, remove the duplicate part
        if (completion.startsWith(partialKeyword)) {
            return completion.slice(partialKeyword.length).trimLeft();
        }
        return completion;
    }

    private static determineContext(text: string, languageId: string): string {
        // Analyze preceding text to determine context
        // This helps in providing more accurate completions
        if (text.includes('class')) return 'class';
        if (text.includes('def') || text.includes('function')) return 'function';
        if (text.includes('if') || text.includes('else')) return 'conditional';
        return 'unknown';
    }

    private static formatWithRule(
        rule: LineBreakRule,
        position: vscode.Position,
        completionText: string,
        currentIndentation: string
    ): { text: string; range: vscode.Range } {
        const nextIndentation = rule.indentNextLine
            ? this.increaseIndentation(currentIndentation)
            : currentIndentation;

        const formattedCompletion = rule.shouldBreak
            ? `\n${nextIndentation}${completionText.trimLeft()}`
            : completionText;

        return {
            text: formattedCompletion,
            range: new vscode.Range(position, position)
        };
    }

    private static getIndentation(line: string): string {
        const match = line.match(/^[\s\t]*/);
        return match ? match[0] : '';
    }

    private static increaseIndentation(currentIndent: string): string {
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
