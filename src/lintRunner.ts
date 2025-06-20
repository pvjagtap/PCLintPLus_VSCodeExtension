// src/lintRunner.ts
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Configuration options for running PC-Lint Plus.
 * @property executablePath - Path to the PC-Lint Plus executable.
 * @property configFiles - Optional array of config file paths.
 * @property repositoryPath - Optional repository root path.
 * @property includePaths - Optional array of include paths.
 * @property preprocessorDefinitions - Optional array of preprocessor definitions.
 * @property additionalArgs - Optional array of additional command-line arguments.
 * @property useVSCodeIncludes - Whether to use VSCode include paths.
 * @property outputFormat - Optional output format string.
 */
export interface LintConfig {
    executablePath: string;
    configFiles?: string[];
    repositoryPath?: string;
    includePaths?: string[];
    preprocessorDefinitions?: string[];
    additionalArgs?: string[];
    useVSCodeIncludes?: boolean;
    outputFormat?: string;  
}

export class LintRunner {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    
    /**
     * Creates a new LintRunner instance.
     * @param diagnosticCollection The VSCode diagnostic collection to update.
     * @param outputChannel The VSCode output channel for logging.
     */
    constructor(diagnosticCollection: vscode.DiagnosticCollection, outputChannel: vscode.OutputChannel) {
        this.diagnosticCollection = diagnosticCollection;
        this.outputChannel = outputChannel;
    }
    

    /**
     * Checks if the lint output contains any issues (errors, warnings, or notes).
     * @param output The output string from PC-Lint Plus.
     * @returns True if issues are found, false otherwise.
     */
    private hasLintIssues(output: string): boolean {
        // Check for issue tags in XML output
        if (output.includes('<lintanalysis>') && output.includes('<issue ')) {
            return true;
        }
        
        // For non-XML output, look for common error or warning indicators
        const lines = output.split('\n');
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('error') || lowerLine.includes('warning') || lowerLine.includes('note')) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Counts the number of issues and files with issues in the lint output.
     * @param output The output string from PC-Lint Plus.
     * @returns An object with total issue count and number of files with issues.
     */
    private countLintIssues(output: string): { total: number; files: number } {
        let totalIssues = 0;
        const filesWithIssues = new Set<string>();
        
        // For XML output
        if (output.includes('<lintanalysis>')) {
            const issueRegex = /<issue file\s*=\s*["']([^"']+)["']/g;
            let match;
            
            while ((match = issueRegex.exec(output)) !== null) {
                const [, filePath] = match;
                filesWithIssues.add(filePath);
                totalIssues++;
            }
        } else {
            // For non-XML output (simplified)
            const lines = output.split('\n');
            for (const line of lines) {
                const lowerLine = line.toLowerCase();
                if (lowerLine.includes('error') || lowerLine.includes('warning') || lowerLine.includes('note')) {
                    totalIssues++;
                    // Attempt to extract filename - this would need to be adapted to your format
                    const fileMatch = line.match(/^([^:]+):/);
                    if (fileMatch) {
                        filesWithIssues.add(fileMatch[1]);
                    }
                }
            }
        }
        
        return {
            total: totalIssues,
            files: filesWithIssues.size
        };
    }

    /**
     * Lints a single file and updates diagnostics/output accordingly.
     * @param filePath The path to the file to lint.
     * @param config The lint configuration.
     * @returns A promise that resolves when linting is complete.
     */
    public async lintFile(filePath: string, config: LintConfig): Promise<void> {
        // Clear previous output to keep console clean
        this.outputChannel.clear();
        this.outputChannel.appendLine(`Linting file: ${filePath}`);
        
        return new Promise((resolve, reject) => {
            this.runPCLintPlus([filePath], config)
                .then(output => {
                    // Check if there were any lint issues
                    if (this.hasLintIssues(output)) {
                        this.outputChannel.appendLine(`Lint issues found in ${filePath}`);
                        // Clear existing diagnostics for single file linting
                        this.parseLintOutput(output, filePath, true);
                    } else {
                        // Clear the console again and just show a success message
                        this.outputChannel.clear();
                        this.outputChannel.appendLine(`Successfully linted ${filePath} - No issues found`);
                        // Clear diagnostics for this file since no issues found
                        this.diagnosticCollection.set(vscode.Uri.file(filePath), []);
                    }
                    resolve();
                })
                .catch(err => {
                    this.outputChannel.appendLine(`Error in lintFile: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    reject(err);
                });
        });
    }
    
    /**
     * Lints multiple files in the workspace, updating diagnostics and progress.
     * @param filePaths Array of file paths to lint.
     * @param config The lint configuration.
     * @param progress Optional VSCode progress reporter.
     * @param token Optional cancellation token.
     * @returns A promise that resolves when linting is complete.
     */
    public async lintWorkspace(
        filePaths: string[], 
        config: LintConfig,
        progress?: vscode.Progress<{ message?: string; increment?: number }>,
        token?: vscode.CancellationToken
    ): Promise<void> {
        // Clear previous diagnostics ONLY ONCE at the start
        this.diagnosticCollection.clear();
        this.outputChannel.appendLine('Cleared all previous diagnostics for workspace lint');
        
        const totalFiles = filePaths.length;
        this.outputChannel.appendLine(`Starting workspace lint: ${totalFiles} files to process`);
        
        // Keep track of issues for summary
        let issueCount = 0;
        let filesWithIssues = 0;
        
        // Process one file at a time to avoid command line length issues
        for (let i = 0; i < totalFiles; i++) {
            if (token && token.isCancellationRequested) {
                this.outputChannel.appendLine('Lint cancelled by user');
                throw new Error('cancelled');
            }
            
            const filePath = filePaths[i];
            const percentComplete = Math.round((i / totalFiles) * 100);
            
            // Update progress less frequently to avoid console clutter
            if (i % 10 === 0) {
                this.outputChannel.clear();
                this.outputChannel.appendLine(`Linting progress: ${i}/${totalFiles} files (${percentComplete}%)`);
                
                progress?.report({ 
                    message: `Processing files: ${i}/${totalFiles} (${percentComplete}%)`, 
                    increment: (10 / totalFiles) * 100 
                });
            }
            
            try {
                // Lint a single file
                const output = await this.runPCLintPlus([filePath], config);
                
                // Check if this file has issues
                if (this.hasLintIssues(output)) {
                    // Process output and update diagnostics immediately
                    // Pass false to NOT clear existing diagnostics (accumulate them)
                    this.parseLintOutput(output, filePath, false);
                    
                    const issuesInFile = this.countLintIssues(output);
                    issueCount += issuesInFile.total;
                    filesWithIssues += 1;
                    
                    this.outputChannel.appendLine(`Found ${issuesInFile.total} issues in file ${i+1}/${totalFiles}: ${path.basename(filePath)}`);
                }
            } catch (err) {
                // Continue with the next file even if the current one fails
                this.outputChannel.appendLine(`Error linting file ${filePath}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
        
        // Final summary
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('===== Lint Summary =====');
        this.outputChannel.appendLine(`Total files processed: ${totalFiles}`);
        this.outputChannel.appendLine(`Files with issues: ${filesWithIssues}`);
        this.outputChannel.appendLine(`Total issues found: ${issueCount}`);
        this.outputChannel.appendLine('=======================');
    }
    

    /**
     * Runs PC-Lint Plus with the given files and configuration, handling temp config creation and output.
     * @param files Array of file paths to lint.
     * @param config The lint configuration.
     * @returns A promise resolving to the combined output from PC-Lint Plus.
     */
    private async runPCLintPlus(files: string[], config: LintConfig): Promise<string> {
        // Note: We no longer call addVSCodeIncludePaths here since it was adding to command line
        // VSCode paths will be added to temp config file instead
        
        return new Promise(async (resolve, reject) => {
            // Validate executable path
            if (!config.executablePath) {
                const error = 'PC-Lint Plus executable path is not configured';
                this.outputChannel.appendLine(error);
                vscode.window.showErrorMessage(error, 'Configure Path')
                    .then(selection => {
                        if (selection === 'Configure Path') {
                            vscode.commands.executeCommand('workbench.action.openSettings', 'pclintplus.executablePath');
                        }
                    });
                reject(new Error(error));
                return;
            }

            // Validate executable existence
            if (!fs.existsSync(config.executablePath)) {
                const error = `PC-Lint Plus executable not found at: ${config.executablePath}`;
                this.outputChannel.appendLine(error);
                vscode.window.showErrorMessage(error, 'Select Executable')
                    .then(selection => {
                        if (selection === 'Select Executable') {
                            vscode.commands.executeCommand('vscode-pclint-plus.configurePCLintPath');
                        }
                    });
                reject(new Error(error));
                return;
            }
            
            const args: string[] = [];
            
            // Add config files
            const configFiles = config.configFiles || [];
            for (const configFile of configFiles) {
                if (!configFile) continue;
                
                // Try multiple resolution methods
                let resolvedPath = configFile;
                
                // Check if the path needs variable substitution
                if (configFile.includes('${workspaceFolder}')) {
                    resolvedPath = configFile.replace('${workspaceFolder}', 
                        vscode.workspace.workspaceFolders 
                            ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                            : process.cwd());
                }
                
                // Try as-is first
                if (fs.existsSync(resolvedPath)) {
                    const quotedConfigFile = `"${resolvedPath.replace(/"/g, '\\"')}"`;
                    args.push(quotedConfigFile);
                    this.outputChannel.appendLine(`Using config file: ${quotedConfigFile}`);
                    continue;
                }
                
                // Try relative to repository path
                const relativeToRepo = path.join(config.repositoryPath || process.cwd(), configFile);
                if (fs.existsSync(relativeToRepo)) {
                    const quotedConfigFile = `"${relativeToRepo.replace(/"/g, '\\"')}"`;
                    args.push(quotedConfigFile);
                    this.outputChannel.appendLine(`Using config file (relative to repo): ${quotedConfigFile}`);
                    continue;
                }
                
                // Try as a simple filename in cfg/pclint_plus
                const defaultLocation = path.join(
                    config.repositoryPath || process.cwd(), 
                    'cfg', 'pclint_plus', 
                    path.basename(configFile)
                );
                if (fs.existsSync(defaultLocation)) {
                    const quotedConfigFile = `"${defaultLocation.replace(/"/g, '\\"')}"`;
                    args.push(quotedConfigFile);
                    this.outputChannel.appendLine(`Using config file (from default location): ${quotedConfigFile}`);
                    continue;
                }
                
                this.outputChannel.appendLine(`Warning: Config file not found: ${configFile}`);
                this.outputChannel.appendLine(`  Tried locations: 
                    - ${resolvedPath}
                    - ${relativeToRepo}
                    - ${defaultLocation}`);
            }
            
            // Create a temporary config file for include paths and preprocessor definitions
            const tempConfigPath = path.join(os.tmpdir(), `pclint_config_${Date.now()}.lnt`);
            let tempConfigContent = '// Temporary PC-Lint Plus configuration file\n';
            let totalIncludesAdded = 0;
            
            // Add standard include paths to the temp config
            const includePaths = config.includePaths || [];
            this.outputChannel.appendLine(`Processing ${includePaths.length} standard include paths`);
            
            for (const includePath of includePaths) {
                // Remove any "-i" prefix if present
                const cleanPath = includePath.replace(/^-i["']?|["']?$/, '');
                
                // Skip wildcard-only paths
                if (cleanPath.endsWith('/**') && !cleanPath.endsWith('/') && 
                    !cleanPath.endsWith('\\')) {
                    this.outputChannel.appendLine(`Skipping wildcard-only path: ${cleanPath}`);
                    continue;
                }
                
                // Resolve any workspace folder variables
                const resolvedPath = cleanPath.replace('${workspaceFolder}', 
                    vscode.workspace.workspaceFolders 
                        ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                        : process.cwd()
                );

                // Check if the path exists
                if (fs.existsSync(resolvedPath)) {
                    tempConfigContent += `-i"${resolvedPath}"\n`;
                    totalIncludesAdded++;
                } else {
                    // Try resolving relative to the repository path
                    const relativeToRepo = path.join(config.repositoryPath || process.cwd(), resolvedPath);
                    if (fs.existsSync(relativeToRepo)) {
                        tempConfigContent += `-i"${relativeToRepo}"\n`;
                        totalIncludesAdded++;
                        
                        // Only log occasionally to reduce output spam
                        if (totalIncludesAdded % 25 === 0) {
                            this.outputChannel.appendLine(`Added include path (relative): ${relativeToRepo}`);
                        }
                    } else {
                        // Only log missing paths occasionally to avoid spam
                        if (totalIncludesAdded % 50 === 0) {
                            this.outputChannel.appendLine(`Warning: Include path not found: ${resolvedPath}`);
                        }
                    }
                }
            }
            
            this.outputChannel.appendLine(`Added ${totalIncludesAdded} standard include paths to temp config`);
            
            // Add VSCode include paths to temp config (NEW - replaces command line addition)
            if (config.useVSCodeIncludes) {
                this.outputChannel.appendLine('Adding VSCode include paths to temp config...');
                try {
                    const vsCodeIncludes = await this.getVSCodeIncludePaths();
                    this.outputChannel.appendLine(`Processing ${vsCodeIncludes.length} VSCode include paths`);
                    
                    // Filter out paths that are already in the standard include paths
                    const existingPaths = new Set(includePaths.map(p => 
                        path.normalize(p.replace('${workspaceFolder}', 
                            vscode.workspace.workspaceFolders 
                                ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                                : process.cwd()
                        ))
                    ));
                    
                    let vsCodePathsAdded = 0;
                    for (const includePath of vsCodeIncludes) {
                        // Resolve any workspace folder variables
                        const resolvedPath = includePath.replace('${workspaceFolder}', 
                            vscode.workspace.workspaceFolders 
                                ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                                : process.cwd()
                        );
                        
                        const normalizedPath = path.normalize(resolvedPath);
                        
                        // Skip if already included in standard paths
                        if (existingPaths.has(normalizedPath)) {
                            continue;
                        }

                        // Check if the path exists before adding
                        if (fs.existsSync(resolvedPath)) {
                            tempConfigContent += `-i"${resolvedPath}"\n`;
                            vsCodePathsAdded++;
                            totalIncludesAdded++;
                            
                            // Log progress every 50 paths to show we're working
                            if (vsCodePathsAdded % 50 === 0) {
                                this.outputChannel.appendLine(`Added VSCode include paths: ${vsCodePathsAdded}/${vsCodeIncludes.length}`);
                            }
                        } else {
                            // Try resolving relative to the repository path
                            const relativeToRepo = path.join(config.repositoryPath || process.cwd(), resolvedPath);
                            if (fs.existsSync(relativeToRepo)) {
                                tempConfigContent += `-i"${relativeToRepo}"\n`;
                                vsCodePathsAdded++;
                                totalIncludesAdded++;
                            }
                            // Don't log missing VSCode paths to avoid spam
                        }
                    }
                    
                    this.outputChannel.appendLine(`Added ${vsCodePathsAdded} unique VSCode include paths to temp config`);
                } catch (error) {
                    this.outputChannel.appendLine(`Error adding VSCode include paths: ${error}`);
                }
            }
            
            // Add preprocessor definitions to the temp config
            const preprocessorDefs = config.preprocessorDefinitions || [];
            for (const def of preprocessorDefs) {
                tempConfigContent += `-d${def}\n`;
            }
            
            // Write the temp config file
            fs.writeFileSync(tempConfigPath, tempConfigContent);
            this.outputChannel.appendLine(`Created temporary config file: ${tempConfigPath} (${tempConfigContent.length} bytes, ${totalIncludesAdded} total include paths)`);
            
            // Add the temp config file to the args
            args.push(`"${tempConfigPath}"`);
            
            // Add additional arguments (these should be minimal now)
            const additionalArgs = config.additionalArgs || [];
            args.push(...additionalArgs);
            this.outputChannel.appendLine(`Added additional arguments: ${additionalArgs.join(', ')}`);
            
            // Add files to lint
            args.push(...files.map(file => `"${file}"`));
            this.outputChannel.appendLine(`Files to lint: ${files.length}`);
            if (files.length > 0) {
                this.outputChannel.appendLine(`First file: ${files[0]}`);
            }
            
            // Log command line length for debugging
            const fullCommand = `${config.executablePath} ${args.join(' ')}`;
            this.outputChannel.appendLine(`Command line length: ${fullCommand.length} characters`);
            
            // Run PC-Lint Plus
            try {
                const pclint = cp.spawn(config.executablePath, args, { 
                    shell: true,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: config.repositoryPath || process.cwd()
                });
                
                let stdout = '';
                let stderr = '';
                
                pclint.stdout.on('data', (data) => {
                    const text = data.toString();
                    stdout += text;
                    this.outputChannel.appendLine(`PC-Lint Plus stdout: ${text}`);
                });
                
                pclint.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderr += text;
                    this.outputChannel.appendLine(`PC-Lint Plus stderr: ${text}`);
                });
                
                pclint.on('close', (code) => {
                    this.outputChannel.appendLine(`PC-Lint Plus process exited with code ${code}`);
                    
                    // Clean up temp file
                    try {
                        fs.unlinkSync(tempConfigPath);
                        this.outputChannel.appendLine(`Removed temporary config file: ${tempConfigPath}`);
                    } catch (error) {
                        this.outputChannel.appendLine(`Error removing temporary config file: ${error}`);
                    }
                    
                    const combinedOutput = stdout + '\n' + stderr;
                    
                    if (code !== 0) {
                        this.outputChannel.appendLine(`PC-Lint Plus encountered issues: ${combinedOutput}`);
                    }
                    
                    resolve(combinedOutput);
                });
                
                pclint.on('error', (err) => {
                    // Clean up temp file
                    try {
                        fs.unlinkSync(tempConfigPath);
                        this.outputChannel.appendLine(`Removed temporary config file: ${tempConfigPath}`);
                    } catch (error) {
                        this.outputChannel.appendLine(`Error removing temporary config file: ${error}`);
                    }
                    
                    const message = `Failed to run PC-Lint Plus: ${err.message}`;
                    this.outputChannel.appendLine(message);
                    reject(new Error(message));
                });
            } catch (error) {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempConfigPath);
                    this.outputChannel.appendLine(`Removed temporary config file: ${tempConfigPath}`);
                } catch (err) {
                    this.outputChannel.appendLine(`Error removing temporary config file: ${err}`);
                }
                
                this.outputChannel.appendLine(`Error spawning PC-Lint Plus process: ${error}`);
                reject(error);
            }
        });
    }


    /**
     * Collects diagnostics from PC-Lint Plus output in XML format and updates the diagnostic collection.
     * @param output The output string from PC-Lint Plus.
     * @returns A map of file URIs to arrays of diagnostics.
     */
    private collectDiagnostics(output: string): Map<string, vscode.Diagnostic[]> {
        const diagnosticMap = new Map<string, vscode.Diagnostic[]>();
        
        if (!output || output.trim() === '') {
            return diagnosticMap;
        }
        
        // Clear existing diagnostics first
        this.diagnosticCollection.clear();
        this.outputChannel.appendLine('=== DIAGNOSTIC COLLECTION DEBUG ===');
        
        // If output is in XML format
        if (output.includes('<lintanalysis>')) {
            // Use regex to extract all issue tags
            const issueRegex = /<issue file\s*=\s*["']([^"']+)["']\s*line\s*=\s*["']([^"']+)["']\s*number\s*=\s*["']([^"']+)["']\s*desc\s*=\s*["']([^"']+)["']/g;
            
            let match;
            let totalIssues = 0;
            let processedIssues = 0;
            
            while ((match = issueRegex.exec(output)) !== null) {
                const [, filePath, lineInfo, code, message] = match;
                totalIssues++;
                
                this.outputChannel.appendLine(`Processing issue ${totalIssues}: ${filePath}`);
                
                // Skip system headers but still show debug info
                if (filePath.includes('TASKING') || filePath.includes('ctc/include')) {
                    this.outputChannel.appendLine(`  → Skipped (system header)`);
                    continue;
                }
                
                // Process all non-system header issues (not just MISRA for debugging)
                
                // Parse line information
                const lineParts = lineInfo.split('-');
                const line = parseInt(lineParts[0]) || 1;
                const column = lineParts.length > 1 ? parseInt(lineParts[1]) || 0 : 0;
                
                // Determine severity
                let severity: vscode.DiagnosticSeverity;
                if (message.includes('error') || code === '322' || code === '72') {
                    severity = vscode.DiagnosticSeverity.Error;
                } else if (message.includes('warning')) {
                    severity = vscode.DiagnosticSeverity.Warning;
                } else {
                    severity = vscode.DiagnosticSeverity.Information;
                }
                
                // Create range
                const lineNumber = Math.max(0, line - 1);
                const columnNumber = Math.max(0, column);
                const range = new vscode.Range(lineNumber, columnNumber, lineNumber, columnNumber + 20);
                
                // Decode XML entities
                const decodedMessage = this.decodeXmlEntities(message);
                
                // Create diagnostic
                const diagnostic = new vscode.Diagnostic(range, decodedMessage, severity);
                diagnostic.code = code;
                diagnostic.source = 'PC-Lint Plus';
                
                try {
                    // Handle file path - this is critical
                    let normalizedPath = filePath;
                    
                    // Convert to Windows path format
                    if (process.platform === 'win32') {
                        normalizedPath = normalizedPath.replace(/\//g, '\\');
                    }
                    
                    // Make absolute if needed
                    if (!path.isAbsolute(normalizedPath)) {
                        const workspaceRoot = vscode.workspace.workspaceFolders 
                            ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                            : process.cwd();
                        normalizedPath = path.resolve(workspaceRoot, normalizedPath);
                    }
                    
                    this.outputChannel.appendLine(`  → Original: ${filePath}`);
                    this.outputChannel.appendLine(`  → Normalized: ${normalizedPath}`);
                    
                    // Create URI
                    const uri = vscode.Uri.file(normalizedPath);
                    const key = uri.toString();
                    
                    this.outputChannel.appendLine(`  → URI: ${key}`);
                    
                    // Add to diagnostics map
                    let diagnostics = diagnosticMap.get(key);
                    if (!diagnostics) {
                        diagnostics = [];
                        diagnosticMap.set(key, diagnostics);
                    }
                    diagnostics.push(diagnostic);
                    processedIssues++;
                    
                    this.outputChannel.appendLine(`  → ✓ Added diagnostic: ${decodedMessage.substring(0, 50)}...`);
                    
                } catch (error) {
                    this.outputChannel.appendLine(`  → ✗ Error processing: ${error}`);
                }
            }
            
            this.outputChannel.appendLine(`=== SUMMARY ===`);
            this.outputChannel.appendLine(`Total issues: ${totalIssues}`);
            this.outputChannel.appendLine(`Processed: ${processedIssues}`);
            this.outputChannel.appendLine(`Files with diagnostics: ${diagnosticMap.size}`);
            
            // IMMEDIATELY set the diagnostics
            for (const [uriString, diagnostics] of diagnosticMap.entries()) {
                try {
                    const uri = vscode.Uri.parse(uriString);
                    this.diagnosticCollection.set(uri, diagnostics);
                    this.outputChannel.appendLine(`✓ SET ${diagnostics.length} diagnostics for: ${uri.fsPath}`);
                } catch (error) {
                    this.outputChannel.appendLine(`✗ FAILED to set diagnostics: ${error}`);
                }
            }
        }
        
        return diagnosticMap;
    }


    /**
     * Decode XML entities to their corresponding characters
     */
    private decodeXmlEntities(text: string): string {
        return text
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    
    /**
     * Parses PC-Lint Plus output and creates diagnostics for the relevant files.
     * @param output The output string from PC-Lint Plus.
     * @param sourceFilePath The source file being linted.
     * @param clearExistingDiagnostics Whether to clear existing diagnostics (default: true).
     */
    private parseLintOutput(output: string, sourceFilePath: string, clearExistingDiagnostics: boolean = true): void {
        if (!output || output.trim() === '') {
            this.outputChannel.appendLine('No output to parse from PC-Lint Plus');
            return;
        }
        
        // Only clear existing diagnostics if explicitly requested (for single file linting)
        if (clearExistingDiagnostics) {
            this.diagnosticCollection.clear();
            this.outputChannel.appendLine('Cleared existing diagnostics');
        }
        
        const diagnosticMap = new Map<string, vscode.Diagnostic[]>();
        let sourceFileIssues = 0;
        let headerFileIssues = 0;
        let otherFileIssues = 0;
        let systemHeaderIssues = 0;
        
        // If output is in XML format
        if (output.includes('<lintanalysis>')) {
            const issueRegex = /<issue file\s*=\s*["']([^"']+)["']\s*line\s*=\s*["']([^"']+)["']\s*number\s*=\s*["']([^"']+)["']\s*desc\s*=\s*["']([^"']+)["']/g;
            
            let match;
            let totalIssues = 0;
            
            while ((match = issueRegex.exec(output)) !== null) {
                const [, filePath, lineInfo, code, message] = match;
                totalIssues++;
                
                // Skip system headers but count them
                if (filePath.includes('TASKING') || filePath.includes('ctc/include')) {
                    systemHeaderIssues++;
                    continue;
                }
                
                // Parse line information
                const lineParts = lineInfo.split('-');
                const line = parseInt(lineParts[0]) || 1;
                const column = lineParts.length > 1 ? parseInt(lineParts[1]) || 0 : 0;
                
                // Determine severity
                let severity: vscode.DiagnosticSeverity;
                if (message.includes('error') || code === '322' || code === '72') {
                    severity = vscode.DiagnosticSeverity.Error;
                } else if (message.includes('warning')) {
                    severity = vscode.DiagnosticSeverity.Warning;
                } else {
                    severity = vscode.DiagnosticSeverity.Information;
                }
                
                // Create range
                const lineNumber = Math.max(0, line - 1);
                const columnNumber = Math.max(0, column);
                const range = new vscode.Range(lineNumber, columnNumber, lineNumber, columnNumber + 20);
                
                // Decode XML entities
                const decodedMessage = this.decodeXmlEntities(message);
                
                // Create diagnostic
                const diagnostic = new vscode.Diagnostic(range, decodedMessage, severity);
                diagnostic.code = code;
                diagnostic.source = 'PC-Lint Plus';
                
                try {
                    // Handle file path
                    let normalizedPath = filePath;
                    
                    // Convert to Windows path format
                    if (process.platform === 'win32') {
                        normalizedPath = normalizedPath.replace(/\//g, '\\');
                    }
                    
                    // Make absolute if needed
                    if (!path.isAbsolute(normalizedPath)) {
                        const workspaceRoot = vscode.workspace.workspaceFolders 
                            ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                            : process.cwd();
                        normalizedPath = path.resolve(workspaceRoot, normalizedPath);
                    }
                    
                    // Check if this is the source file being linted
                    const normalizedSourcePath = path.normalize(sourceFilePath);
                    if (path.normalize(normalizedPath) === normalizedSourcePath) {
                        sourceFileIssues++;
                        this.outputChannel.appendLine(`✓ Source file issue: ${decodedMessage.substring(0, 50)}...`);
                    } else if (normalizedPath.endsWith('.h') || normalizedPath.endsWith('.hpp')) {
                        headerFileIssues++;
                        this.outputChannel.appendLine(`→ Header file issue: ${path.basename(normalizedPath)}`);
                    } else {
                        otherFileIssues++;
                        this.outputChannel.appendLine(`→ Other file issue: ${path.basename(normalizedPath)}`);
                    }
                    
                    // Create URI and add to diagnostics map
                    const uri = vscode.Uri.file(normalizedPath);
                    const key = uri.toString();
                    
                    let diagnostics = diagnosticMap.get(key);
                    if (!diagnostics) {
                        diagnostics = [];
                        diagnosticMap.set(key, diagnostics);
                    }
                    diagnostics.push(diagnostic);
                    
                } catch (error) {
                    this.outputChannel.appendLine(`Error processing file path ${filePath}: ${error}`);
                }
            }
            
            this.outputChannel.appendLine(`=== SUMMARY ===`);
            this.outputChannel.appendLine(`Source file issues: ${sourceFileIssues}`);
            this.outputChannel.appendLine(`Header file issues: ${headerFileIssues}`);
            this.outputChannel.appendLine(`Other file issues: ${otherFileIssues}`);
            this.outputChannel.appendLine(`System header issues (skipped): ${systemHeaderIssues}`);
            
            // If no issues in the source file but issues in other files, create a summary diagnostic
            if (sourceFileIssues === 0 && (headerFileIssues > 0 || otherFileIssues > 0)) {
                this.outputChannel.appendLine('Creating summary diagnostic for source file...');
                
                const summaryMessage = `PC-Lint Plus found ${headerFileIssues + otherFileIssues} issue(s) in included files` +
                                    `${headerFileIssues > 0 ? ` (${headerFileIssues} in headers` : ''}` +
                                    `${otherFileIssues > 0 ? `, ${otherFileIssues} in other files` : ''}` +
                                    `${headerFileIssues > 0 ? ')' : ''}. Check the PC-Lint Plus output for details.`;
                
                const summaryDiagnostic = new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 50),
                    summaryMessage,
                    vscode.DiagnosticSeverity.Information
                );
                summaryDiagnostic.source = 'PC-Lint Plus Summary';
                
                // Add summary diagnostic to the source file
                const sourceUri = vscode.Uri.file(sourceFilePath);
                const sourceKey = sourceUri.toString();
                
                let sourceDiagnostics = diagnosticMap.get(sourceKey);
                if (!sourceDiagnostics) {
                    sourceDiagnostics = [];
                    diagnosticMap.set(sourceKey, sourceDiagnostics);
                }
                sourceDiagnostics.unshift(summaryDiagnostic); // Add at the beginning
                
                this.outputChannel.appendLine(`✓ Added summary diagnostic to source file`);
            }
        }
        
        // Apply diagnostics to VS Code - ACCUMULATE instead of replace
        let totalDiagnosticsSet = 0;
        for (const [uriString, newDiagnostics] of diagnosticMap.entries()) {
            try {
                const uri = vscode.Uri.parse(uriString);
                
                // Get existing diagnostics for this file (for workspace linting accumulation)
                const existingDiagnostics = this.diagnosticCollection.get(uri) || [];
                
                // Combine existing and new diagnostics
                const combinedDiagnostics = [...existingDiagnostics, ...newDiagnostics];
                
                // Set the combined diagnostics
                this.diagnosticCollection.set(uri, combinedDiagnostics);
                totalDiagnosticsSet += newDiagnostics.length;
                
                this.outputChannel.appendLine(`✓ Added ${newDiagnostics.length} new diagnostics (${combinedDiagnostics.length} total) for: ${path.basename(uri.fsPath)}`);
                
            } catch (error) {
                this.outputChannel.appendLine(`✗ Error setting diagnostics for ${uriString}: ${error}`);
            }
        }
        
        this.outputChannel.appendLine(`=== FINAL RESULT ===`);
        this.outputChannel.appendLine(`New diagnostics added: ${totalDiagnosticsSet}`);
        
        if (totalDiagnosticsSet === 0) {
            this.outputChannel.appendLine('❌ No new diagnostics were added.');
        } else {
            this.outputChannel.appendLine(`✅ Successfully added ${totalDiagnosticsSet} new diagnostics`);
        }
    }


    /**
     * Gets include paths from the VSCode c_cpp_properties.json file if present.
     * @returns A promise resolving to an array of include paths.
     */
    private async getVSCodeIncludePaths(): Promise<string[]> {
        const outputChannel = this.outputChannel;
        outputChannel.appendLine('Getting include paths from c_cpp_properties.json');
        
        try {
            // Find the c_cpp_properties.json file
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                outputChannel.appendLine('No workspace folders found');
                return [];
            }
            
            const vscodeFolder = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
            const propertiesFile = path.join(vscodeFolder, 'c_cpp_properties.json');
            
            outputChannel.appendLine(`Looking for c_cpp_properties.json at: ${propertiesFile}`);
            
            // Check if the file exists
            if (!fs.existsSync(propertiesFile)) {
                outputChannel.appendLine('No c_cpp_properties.json file found');
                
                // Check if the .vscode folder exists
                if (fs.existsSync(vscodeFolder)) {
                    outputChannel.appendLine('.vscode folder exists, but no c_cpp_properties.json file');
                    
                    // List files in .vscode folder
                    const files = fs.readdirSync(vscodeFolder);
                    outputChannel.appendLine(`Files in .vscode folder: ${files.join(', ')}`);
                } else {
                    outputChannel.appendLine('.vscode folder does not exist');
                }
                
                return [];
            }
            
            // Read and parse the file
            const content = fs.readFileSync(propertiesFile, 'utf8');
            outputChannel.appendLine(`Read c_cpp_properties.json (${content.length} bytes)`);
            
            const properties = JSON.parse(content);
            
            // Get configuration for current platform
            const configs = properties.configurations || [];
            outputChannel.appendLine(`Found ${configs.length} configurations`);
            
            const config = configs.find((c: any) => {
                if (process.platform === 'win32' && c.name.includes('Win')) {
                    return true;
                }
                if (process.platform === 'darwin' && c.name.includes('Mac')) {
                    return true;
                }
                if (process.platform === 'linux' && c.name.includes('Linux')) {
                    return true;
                }
                return false;
            }) || configs[0]; // Fall back to first config if no match
            
            if (!config) {
                outputChannel.appendLine('No configuration found in c_cpp_properties.json');
                return [];
            }
            
            outputChannel.appendLine(`Using configuration: ${config.name}`);
            
            // Get include paths
            const includePaths = config.includePath || [];
            outputChannel.appendLine(`Found ${includePaths.length} include paths`);
            
            // Process paths (resolve workspace folder variable)
            const resolvedPaths = includePaths.map((p: string) => {
                // Replace ${workspaceFolder} with actual path
                if (p.includes('${workspaceFolder}')) {
                    const resolved = p.replace('${workspaceFolder}', workspaceFolders[0].uri.fsPath);
                    //outputChannel.appendLine(`Resolved ${p} to ${resolved}`);
                    return resolved;
                }
                return p;
            });
            
            outputChannel.appendLine(`Returning ${resolvedPaths.length} include paths`);
            
            return resolvedPaths;
        } catch (error) {
            outputChannel.appendLine(`Error reading c_cpp_properties.json: ${error}`);
            return [];
        }
    }

    /**
     * Adds VSCode include paths to the lint configuration if enabled. (No-op, for compatibility.)
     * @param config The lint configuration.
     * @returns The unchanged lint configuration.
     */
    private async addVSCodeIncludePaths(config: LintConfig): Promise<LintConfig> {
        // VSCode include paths are now handled in the temp config file
        // This method is kept for compatibility but doesn't modify additionalArgs
        
        if (config.useVSCodeIncludes) {
            this.outputChannel.appendLine('VSCode include paths will be added to temporary config file');
        }
        
        return config;
    }

    /**
     * Adds VSCode include paths to the temporary config file content.
     * @param config The lint configuration.
     * @param tempConfigContent The current temp config file content.
     * @returns A promise resolving to the updated config file content.
     */
    private async addVSCodeIncludePathsToConfig(config: LintConfig, tempConfigContent: string): Promise<string> {
        if (config.useVSCodeIncludes) {
            try {
                const vsCodeIncludes = await this.getVSCodeIncludePaths();
                
                this.outputChannel.appendLine(`Processing ${vsCodeIncludes.length} VSCode include paths`);
                
                // Filter out paths that are already in the main include paths
                const existingPaths = config.includePaths || [];
                const newIncludes = vsCodeIncludes.filter(vsPath => 
                    !existingPaths.some(existing => 
                        // Compare normalized paths
                        path.normalize(vsPath.replace('${workspaceFolder}', 
                            vscode.workspace.workspaceFolders 
                                ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                                : process.cwd()
                        )) === path.normalize(existing.replace('${workspaceFolder}', 
                            vscode.workspace.workspaceFolders 
                                ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                                : process.cwd()
                        ))
                    )
                );
                
                this.outputChannel.appendLine(`Adding ${newIncludes.length} unique VSCode include paths to temp config`);
                
                // Add VSCode include paths to the temp config content
                let addedCount = 0;
                for (const includePath of newIncludes) {
                    // Resolve any workspace folder variables
                    const resolvedPath = includePath.replace('${workspaceFolder}', 
                        vscode.workspace.workspaceFolders 
                            ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                            : process.cwd()
                    );

                    // Check if the path exists before adding
                    if (fs.existsSync(resolvedPath)) {
                        tempConfigContent += `-i"${resolvedPath}"\n`;
                        addedCount++;
                        
                        // Only log every 20th path to avoid cluttering output
                        if (addedCount % 20 === 0) {
                            this.outputChannel.appendLine(`Added VSCode include path ${addedCount}/${newIncludes.length}: ${resolvedPath}`);
                        }
                    } else {
                        // Try resolving relative to the repository path
                        const relativeToRepo = path.join(config.repositoryPath || process.cwd(), resolvedPath);
                        if (fs.existsSync(relativeToRepo)) {
                            tempConfigContent += `-i"${relativeToRepo}"\n`;
                            addedCount++;
                        } else {
                            // Only log missing paths occasionally to avoid spam
                            if (addedCount % 50 === 0) {
                                this.outputChannel.appendLine(`Warning: VSCode include path not found: ${resolvedPath}`);
                            }
                        }
                    }
                }
                
                this.outputChannel.appendLine(`Successfully added ${addedCount} VSCode include paths to temporary config`);
            } catch (error) {
                this.outputChannel.appendLine(`Error adding VSCode include paths: ${error}`);
            }
        }
        
        return tempConfigContent;
    }

    /**
     * Creates a temporary config file for PC-Lint Plus, including include paths and preprocessor definitions.
     * @param config The lint configuration.
     * @returns A promise resolving to the path of the created temp config file.
     */
    private async createTempConfigFile(config: LintConfig): Promise<string> {
        const tempConfigPath = path.join(os.tmpdir(), `pclint_config_${Date.now()}.lnt`);
        let tempConfigContent = '// Temporary PC-Lint Plus configuration file\n';
        
        // Add include paths to the temp config
        const includePaths = config.includePaths || [];
        let addedIncludePaths = 0;
        
        for (const includePath of includePaths) {
            // Remove any "-i" prefix if present
            const cleanPath = includePath.replace(/^-i["']?|["']?$/, '');
            
            // Skip wildcard-only paths
            if (cleanPath.endsWith('/**') && !cleanPath.endsWith('/') && 
                !cleanPath.endsWith('\\')) {
                this.outputChannel.appendLine(`Skipping wildcard-only path: ${cleanPath}`);
                continue;
            }
            
            // Resolve any workspace folder variables
            const resolvedPath = cleanPath.replace('${workspaceFolder}', 
                vscode.workspace.workspaceFolders 
                    ? vscode.workspace.workspaceFolders[0].uri.fsPath 
                    : process.cwd()
            );

            // Check if the path exists
            if (fs.existsSync(resolvedPath)) {
                tempConfigContent += `-i"${resolvedPath}"\n`;
                addedIncludePaths++;
            } else {
                // Try resolving relative to the repository path
                const relativeToRepo = path.join(config.repositoryPath || process.cwd(), resolvedPath);
                if (fs.existsSync(relativeToRepo)) {
                    tempConfigContent += `-i"${relativeToRepo}"\n`;
                    addedIncludePaths++;
                    
                    // Only log occasionally to reduce spam
                    if (addedIncludePaths % 20 === 0) {
                        this.outputChannel.appendLine(`Added include path (relative): ${relativeToRepo}`);
                    }
                } else {
                    // Only log missing paths occasionally
                    if (addedIncludePaths % 50 === 0) {
                        this.outputChannel.appendLine(`Warning: Include path not found: ${resolvedPath}`);
                    }
                }
            }
        }
        
        this.outputChannel.appendLine(`Added ${addedIncludePaths} standard include paths to temp config`);
        
        // Add VSCode include paths to temp config (this replaces command line addition)
        tempConfigContent = await this.addVSCodeIncludePathsToConfig(config, tempConfigContent);
        
        // Add preprocessor definitions to the temp config
        const preprocessorDefs = config.preprocessorDefinitions || [];
        for (const def of preprocessorDefs) {
            tempConfigContent += `-d${def}\n`;
        }
        
        // Write the temp config file
        fs.writeFileSync(tempConfigPath, tempConfigContent);
        this.outputChannel.appendLine(`Created temporary config file: ${tempConfigPath} (${tempConfigContent.length} bytes)`);
        
        return tempConfigPath;
    }
}