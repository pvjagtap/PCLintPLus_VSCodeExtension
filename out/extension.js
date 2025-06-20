"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
// src/extension.ts
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const lintRunner_1 = require("./lintRunner");
let diagnosticCollection;
let lintRunner;
let outputChannel;
/**
 * Activates the PC-Lint Plus extension.
 * Sets up output channel, diagnostics, commands, and listeners.
 * @param context The VSCode extension context.
 */
function activate(context) {
    // Create a visible output channel
    outputChannel = vscode.window.createOutputChannel('PC-Lint Plus');
    context.subscriptions.push(outputChannel);
    outputChannel.show(); // Force the output channel to show
    outputChannel.appendLine('PC-Lint Plus extension is now active at ' + new Date().toLocaleString());
    // Create diagnostic collection for lint issues
    diagnosticCollection = vscode.languages.createDiagnosticCollection('pclintplus');
    context.subscriptions.push(diagnosticCollection);
    // Initialize lint runner
    lintRunner = new lintRunner_1.LintRunner(diagnosticCollection, outputChannel);
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('vscode-pclint-plus.lintCurrentFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            lintCurrentFile(editor.document);
        }
        else {
            outputChannel.appendLine('No active editor found for lint current file command');
            vscode.window.showInformationMessage('Please open a C/C++ file to lint');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vscode-pclint-plus.lintWorkspace', () => {
        lintWorkspace();
    }));
    // Set up file save listener for auto-lint
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
        const config = vscode.workspace.getConfiguration('pclintplus');
        if (config.get('autoLintOnSave')) {
            if (isLintableDocument(document)) {
                lintCurrentFile(document);
            }
        }
    }));
    //clear linter diagnostics on command
    context.subscriptions.push(vscode.commands.registerCommand('vscode-pclint-plus.clearDiagnostics', () => {
        diagnosticCollection.clear();
        outputChannel.clear();
        outputChannel.appendLine('PC-Lint Plus diagnostics cleared');
        vscode.window.setStatusBarMessage('PC-Lint Plus: Diagnostics cleared', 3000);
    }));
    outputChannel.appendLine('PC-Lint Plus extension initialized all commands and listeners');
}
exports.activate = activate;
/**
 * Checks if a document is a lintable C/C++ source or header file.
 * @param document The VSCode text document to check.
 * @returns True if the document is lintable, false otherwise.
 */
function isLintableDocument(document) {
    const isLintable = document.languageId === 'c' ||
        document.languageId === 'cpp' ||
        document.fileName.endsWith('.h') ||
        document.fileName.endsWith('.hpp');
    outputChannel.appendLine(`File check: ${document.fileName} is ${isLintable ? 'lintable' : 'not lintable'}`);
    return isLintable;
}
/**
 * Lints the currently open file in the editor, updating diagnostics and output.
 * @param document The VSCode text document to lint.
 */
async function lintCurrentFile(document) {
    const config = getConfiguration();
    outputChannel.appendLine(`Linting current file: ${document.fileName}`);
    if (!config.executablePath) {
        const message = 'PC-Lint Plus executable path not configured';
        outputChannel.appendLine(message);
        vscode.window.showErrorMessage(message);
        return;
    }
    vscode.window.setStatusBarMessage('PC-Lint Plus: Linting current file...', lintRunner.lintFile(document.uri.fsPath, config)
        .then(() => {
        vscode.window.setStatusBarMessage('PC-Lint Plus: File lint complete', 3000);
    })
        .catch(err => {
        if (err instanceof Error) {
            vscode.window.showErrorMessage(`PC-Lint Plus error: ${err.message}`);
            outputChannel.appendLine(`Error linting file: ${err.message}`);
        }
        else {
            vscode.window.showErrorMessage(`PC-Lint Plus unknown error`);
            outputChannel.appendLine(`Unknown error linting file`);
        }
        vscode.window.setStatusBarMessage('PC-Lint Plus: Error during lint', 3000);
    }));
}
/**
 * Lints all C/C++ files in the workspace, updating diagnostics and output.
 * Handles file discovery, progress reporting, and error handling.
 */
async function lintWorkspace() {
    const config = getConfiguration();
    outputChannel.appendLine('Linting workspace started');
    outputChannel.appendLine(`PC-Lint Plus executable: ${config.executablePath}`);
    outputChannel.appendLine(`PC-Lint Plus config files: ${(config.configFiles || []).join(', ')}`);
    outputChannel.appendLine(`Repository path: ${config.repositoryPath}`);
    if (!config.executablePath) {
        const message = 'PC-Lint Plus executable path not configured';
        outputChannel.appendLine(message);
        vscode.window.showErrorMessage(message);
        return;
    }
    if (!config.repositoryPath) {
        const message = 'Repository path not configured. Please set pclintplus.repositoryPath in settings.';
        outputChannel.appendLine(message);
        vscode.window.showErrorMessage(message);
        return;
    }
    // Check if repository path exists
    if (!fs.existsSync(config.repositoryPath)) {
        const message = `Repository path does not exist: ${config.repositoryPath}`;
        outputChannel.appendLine(message);
        vscode.window.showErrorMessage(message);
        return;
    }
    // Clear previous diagnostics
    diagnosticCollection.clear();
    // Get all C/C++ files in workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        const message = 'No workspace folder is open';
        outputChannel.appendLine(message);
        vscode.window.showInformationMessage(message);
        return;
    }
    outputChannel.appendLine(`Found ${workspaceFolders.length} workspace folders:`);
    for (const folder of workspaceFolders) {
        outputChannel.appendLine(`- ${folder.name}: ${folder.uri.fsPath}`);
    }
    try {
        // Get the file patterns from config
        const filePatterns = vscode.workspace.getConfiguration('pclintplus').get('filePatterns', ['**/*.c', '**/*.h']);
        const excludePatterns = vscode.workspace.getConfiguration('pclintplus').get('excludePatterns', ['**/node_modules/**', '**/build/**', '**/out/**']);
        // Find all files matching the patterns
        const fileUris = [];
        outputChannel.appendLine(`Using file patterns: ${filePatterns.join(', ')}`);
        outputChannel.appendLine(`Using exclude patterns: ${excludePatterns.join(', ')}`);
        for (const pattern of filePatterns) {
            // Create a glob pattern relative to repository path
            const globPattern = new vscode.RelativePattern(config.repositoryPath || process.cwd(), pattern);
            // Find files using the glob pattern
            const files = await vscode.workspace.findFiles(globPattern, `{${excludePatterns.join(',')}}`);
            fileUris.push(...files);
            outputChannel.appendLine(`Found ${files.length} files matching pattern: ${pattern}`);
        }
        // Remove duplicates
        const uniqueUris = [...new Map(fileUris.map(uri => [uri.fsPath, uri])).values()];
        outputChannel.appendLine(`Total unique files found: ${uniqueUris.length}`);
        // Use the repository path from settings
        const basePath = config.repositoryPath;
        // Create a list of specific directories to search in
        const searchDirectories = [
            'cfg/pclint_plus/**',
            'input/src/**',
            'input/swc_bsw/pjspec/**',
            'input/swc_bsw/core/**',
            'input/swc_cdd/**',
            'input/swc_gs/**',
            'input/swc_bc/**',
            'input/swc_cc/**',
            'input/swc_dc/**',
            'input/swc_dy/**',
            'input/lib_fsw/**'
        ];
        outputChannel.appendLine(`Using base path: ${basePath}`);
        outputChannel.appendLine(`Searching in specific directories: ${searchDirectories.join(', ')}`);
        for (const dir of searchDirectories) {
            outputChannel.appendLine(`Searching in ${dir} for .c and .h files...`);
            // Create the full path to search in
            const searchPath = path.join(basePath, dir.replace('/**', ''));
            outputChannel.appendLine(`Full search path: ${searchPath}`);
            if (!fs.existsSync(searchPath)) {
                outputChannel.appendLine(`Directory does not exist: ${searchPath}`);
                continue;
            }
            // Function to recursively find .c and .h files
            const findFiles = (directory, recursive = true) => {
                const result = [];
                const files = fs.readdirSync(directory);
                for (const file of files) {
                    const fullPath = path.join(directory, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory() && recursive) {
                        // Skip node_modules, build, and out directories
                        if (file !== 'node_modules' && file !== 'build' && file !== 'out') {
                            result.push(...findFiles(fullPath, true));
                        }
                    }
                    else if (stat.isFile() && (file.endsWith('.c') || file.endsWith('.h'))) {
                        result.push(fullPath);
                    }
                }
                return result;
            };
            try {
                // Find .c and .h files recursively
                const files = findFiles(searchPath);
                outputChannel.appendLine(`Found ${files.length} .c and .h files in ${dir}`);
                // Convert file paths to URIs
                const uris = files.map(file => vscode.Uri.file(file));
                fileUris.push(...uris);
                // Log some sample files if found
                if (files.length > 0) {
                    outputChannel.appendLine('Sample files:');
                    for (let i = 0; i < Math.min(3, files.length); i++) {
                        outputChannel.appendLine(`  ${i + 1}. ${files[i]}`);
                    }
                }
            }
            catch (error) {
                outputChannel.appendLine(`Error finding files in ${searchPath}: ${error}`);
            }
        }
        // Check if any files were found
        outputChannel.appendLine(`Total files found: ${fileUris.length}`);
        if (fileUris.length === 0) {
            outputChannel.appendLine('No files found. Please check your repository path and directory structure.');
            vscode.window.showInformationMessage('No C/C++ files found in repository. Please check your settings.');
            return;
        }
        // Proceed with linting the files found
        vscode.window.setStatusBarMessage('PC-Lint Plus: Starting workspace lint...');
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "PC-Lint Plus: Linting workspace",
            cancellable: true
        }, async (progress, token) => {
            const filePaths = fileUris.map(uri => uri.fsPath);
            // Limit to 2000 files to avoid overwhelming PC-Lint Plus
            const maxFiles = 2000;
            const filesToLint = uniqueUris.slice(0, maxFiles).map(uri => uri.fsPath);
            if (uniqueUris.length > maxFiles) {
                outputChannel.appendLine(`Limiting to ${maxFiles} files for linting`);
                vscode.window.showWarningMessage(`Found ${uniqueUris.length} files. Limiting to ${maxFiles} for performance.`);
            }
            try {
                await lintRunner.lintWorkspace(filesToLint, config, progress, token);
                vscode.window.setStatusBarMessage('PC-Lint Plus: Workspace lint complete', 3000);
                outputChannel.appendLine('Workspace lint completed successfully');
            }
            catch (err) {
                if (err instanceof Error) {
                    if (err.message !== 'cancelled') {
                        vscode.window.showErrorMessage(`PC-Lint Plus error: ${err.message}`);
                        outputChannel.appendLine(`Error during workspace lint: ${err.message}`);
                    }
                    else {
                        outputChannel.appendLine('Workspace lint cancelled by user');
                    }
                }
                else {
                    vscode.window.showErrorMessage(`PC-Lint Plus unknown error`);
                    outputChannel.appendLine('Unknown error during workspace lint');
                }
                vscode.window.setStatusBarMessage('PC-Lint Plus: Lint operation stopped', 3000);
            }
        });
    }
    catch (error) {
        outputChannel.appendLine(`Unexpected error in lintWorkspace: ${error}`);
        vscode.window.showErrorMessage('Error occurred during workspace lint');
    }
}
/**
 * Retrieves the lint configuration from VSCode settings and workspace context.
 * Resolves include paths, preprocessor definitions, and other options.
 * @returns The constructed LintConfig object.
 */
function getConfiguration() {
    const config = vscode.workspace.getConfiguration('pclintplus');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders
        ? workspaceFolders[0].uri.fsPath
        : process.cwd();
    // Resolve include paths, replacing workspace folder variable
    const includePaths = (config.get('includePaths') || []).map(path => path.replace('${workspaceFolder}', workspaceRoot));
    // Add compiler include path if configured
    const compilerIncludePath = config.get('compilerIncludePath', '');
    if (compilerIncludePath && fs.existsSync(compilerIncludePath)) {
        includePaths.push(compilerIncludePath);
    }
    // Default preprocessor definitions based on your make script
    const defaultPreprocessorDefs = [
        'DEBUG', 'PLATFORM_X86',
        'APPL_BUILD', 'MPT_USE_LIB_FSW',
        'MPT_USE_SWC_BC', 'MPT_USE_SWC_CC',
        'MPT_USE_SWC_DC', 'MPT_USE_SWC_DY',
        'MPT_USE_SWC_GS', 'MPT_USE_SWC_SC',
        'MPT_USE_SWC_SO', 'MPT_USE_SWC_VC'
    ];
    // Combine with user-defined definitions
    const userDefs = config.get('preprocessorDefinitions', []);
    const preprocessorDefinitions = [...new Set([...userDefs, ...defaultPreprocessorDefs])];
    return {
        executablePath: config.get('executablePath', ''),
        configFiles: config.get('configFiles', []),
        repositoryPath: config.get('repositoryPath', workspaceRoot),
        includePaths: includePaths,
        preprocessorDefinitions: preprocessorDefinitions,
        additionalArgs: config.get('additionalArgs', ['-b', '-width(240,4)']),
        useVSCodeIncludes: config.get('useVSCodeIncludes', true),
        outputFormat: config.get('outputFormat', 'xml')
    };
}
/**
 * Deactivates the PC-Lint Plus extension, clearing diagnostics and output.
 */
function deactivate() {
    outputChannel.appendLine('PC-Lint Plus extension deactivated');
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map