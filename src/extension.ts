import * as dotenv from 'dotenv';
import * as vscode from 'vscode';
import { fetchCompletion, checkApiKeyValidity } from './utils';
import { ContextAwareness, UserContext } from './contextAwareness';
import CompletionFormatter from './completionFormatter';

dotenv.config();

// Predefine models
const predefinedModels: { openai: string[]; anthropic: string[] } = {
	openai: ["gpt-4o", "gpt-4o-mini", "gpt-1o-preview", "gpt-1o-mini"],
	anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"]
};

async function selectModel(provider: "openai" | "anthropic"): Promise<string | undefined> {
	const config = vscode.workspace.getConfiguration("codeCompletion");
	const customModels = config.get<{ [key: string]: string[] }>("customModels") || {};

	const allModels = [
		...(predefinedModels[provider] || []), // Safe to index with `provider`
		...(customModels[provider] || []),
		"Add a Model..."
	];

	const selectedModel = await vscode.window.showQuickPick(allModels, {
		title: `Select a model for ${provider}`,
		placeHolder: "Choose a model or add a new one"
	});

	// Handle "Add a Model" option...
	if (selectedModel === "Add a Model...") {
		const newModel = await vscode.window.showInputBox({
			title: "Enter model name",
			prompt: "Provide the name of the new model",
			placeHolder: "e.g., my-custom-model",
			ignoreFocusOut: true
		});

		if (newModel) {
			const updatedCustomModels = { ...customModels };
			if (!updatedCustomModels[provider]) {
				updatedCustomModels[provider] = [];
			}
			updatedCustomModels[provider].push(newModel);
			await config.update("customModels", updatedCustomModels, vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage(`Model '${newModel}' added for ${provider}.`);
			return newModel;
		}
	}

	return selectedModel;
}

export function activate(context: vscode.ExtensionContext) {
	// Initialize the ContextAwareness class
	const contextAwareness = new ContextAwareness();

	// Listen for changes in the active text editor
	vscode.window.onDidChangeActiveTextEditor(() => {
		// Update the sliding window whenever the active editor changes
		contextAwareness.getUserContext();
	});

	// Listen for text document changes (e.g., when the user modifies code)
	vscode.workspace.onDidChangeTextDocument(() => {
		// Update the sliding window context
		contextAwareness.getUserContext();
	});

	// Hook into when a completion item is accepted (if supported by VS Code API)
	vscode.commands.registerCommand('editor.action.acceptCompletionItem', (args: any) => {
		if (args?.item?.label) {
			// Track the accepted suggestion
			contextAwareness.trackAcceptedSuggestion(args.item.label);
		}
	});

	// Register a sample command to fetch and log the user context
	const disposable = vscode.commands.registerCommand('extension.showUserContext', () => {
		const userContext: UserContext = contextAwareness.getUserContext();
		vscode.window.showInformationMessage('User context logged in console.');
		console.log('Current User Context:', userContext);
	});

	// Completion provider command
	const completionProvider = vscode.languages.registerInlineCompletionItemProvider(
		{ scheme: 'file' },
		{
			async provideInlineCompletionItems(document, position, context, token) {
				const userInput = document.lineAt(position).text.substr(0, position.character);

				if (!userInput.trim()) {
					return { items: [] };
				}

				// Retrieve user context
				const userContext = contextAwareness.getUserContext();

				// Extract relevant context details
				const recentCode = userContext.recentLines.join('\n');
				const acceptedSuggestions = userContext.acceptedSuggestions.join(', ');
				const surrondingCode = userContext.surroundingContext;

				// Create the prompt
				const prompt = `
					You are a helpful coding assistant. Your task is to complete code snippets.
					The user is currently coding in ${document.languageId}.
					
					Here is the recent code context (last ${userContext.recentLines.length} lines):
					${recentCode}

					The user has previously accepted the following suggestions:
					${acceptedSuggestions || 'None'}

					Code in the surronding:
					${surrondingCode}

					Only complete the code from where the user's input ends. Do not repeat or duplicate the user's input.
					Provide the output as a string containing only the remaining part of the code.

					Completion starts after the input. Here's the input to complete:
					${userInput}
				`;

				const completionText = await fetchCompletion(prompt);

				if (!completionText || token.isCancellationRequested) {
					return { items: [] };
				}

				// Format the completion using formatter
				const formattedCompletion = CompletionFormatter.formatCompletion(
					document,
					position,
					completionText
				);

				const item = new vscode.InlineCompletionItem(
					formattedCompletion.text,
					formattedCompletion.range
				);

				item.range = new vscode.Range(position, position);

				return { items: [item] };
			},
		}
	);

	// Command to setup Null code suggestions
	const setupCommand = vscode.commands.registerCommand('codeCompletion.setup', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your API Key',
			placeHolder: 'Your API Key...',
			ignoreFocusOut: true,
			password: true,
		});

		if (!apiKey) {
			vscode.window.showErrorMessage('API Key is required!');
			return;
		}

		const provider = await vscode.window.showQuickPick(['openai', 'anthropic'], {
			placeHolder: 'Select the provider (OpenAI or Anthropic)',
			ignoreFocusOut: true,
		});

		if (!provider) {
			vscode.window.showErrorMessage('Provider is required!');
			return;
		}

		// @ts-ignore
		const model = await selectModel(provider);

		if (!model) {
			vscode.window.showErrorMessage('Model selection is required!');
			return;
		}

		// Validate API Key
		const isValidApiKey = await checkApiKeyValidity(apiKey, provider, model);
		if (!isValidApiKey) {
			vscode.window.showErrorMessage('Invalid API Key or Model Name. Please check and try again.');
			return;
		}

		// Save Configurations
		await vscode.workspace.getConfiguration('codeCompletion').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration('codeCompletion').update('provider', provider, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration('codeCompletion').update('model', model, vscode.ConfigurationTarget.Global);

		vscode.window.showInformationMessage(`Setup complete with Provider: ${provider}, Model: ${model}.`);
	});

	context.subscriptions.push(setupCommand);
	context.subscriptions.push(completionProvider);
	context.subscriptions.push(disposable);

}

export function deactivate() { }
