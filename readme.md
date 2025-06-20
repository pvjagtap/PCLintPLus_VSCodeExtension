# PC-Lint Plus Extension for Visual Studio Code

This extension integrates the PC-Lint Plus static code analysis tool with Visual Studio Code, making it easy to lint C/C++ files and view the results directly in the VS Code interface with comprehensive diagnostic support and intelligent include path management.

## ✨ Features

- **Single File & Workspace Linting**: Lint individual files or entire workspaces with progress tracking
- **Smart Diagnostic Management**: Results displayed in VS Code's Problems panel with accumulation across workspace files
- **Auto-Lint on Save**: Configurable automatic linting when files are saved
- **Multiple Include Path Sources**: Integrates with VSCode C++ extension and custom configurations
- **Advanced Configuration**: Support for custom PC-Lint configuration files and preprocessor definitions
- **Command Line Length Fix**: Uses temporary configuration files to avoid Windows command line limitations
- **Real-time Progress**: Workspace linting with cancellation support and progress reporting
- **System Header Filtering**: Automatically filters out system header issues (TASKING compiler, etc.)
- **Summary Diagnostics**: Shows summary information for issues in included files


## 📋 Requirements

- **PC-Lint Plus** must be installed on your system
- **Visual Studio Code** 1.60.0 or newer
- **C/C++ source files** (.c, .cpp, .h, .hpp)

## 📦 Installation

1. Install the extension from the Visual Studio Code Marketplace
2. Configure the extension settings (see Configuration section below)
3. Set up your PC-Lint Plus executable path
4. Configure include paths and preprocessor definitions as needed

## ⚙️ Configuration

### Core Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `pclintplus.executablePath` | Path to the PC-Lint Plus executable | `""` |
| `pclintplus.repositoryPath` | Root path for the repository being analyzed | Workspace folder |
| `pclintplus.configFiles` | List of PC-Lint configuration files (.lnt) | Predefined config files |
| `pclintplus.outputFormat` | Output format for PC-Lint Plus | `"xml"` |

### Include Path Management

| Setting | Description | Default |
|---------|-------------|---------|
| `pclintplus.includePaths` | List of include paths for the linter | Extensive default paths |
| `pclintplus.compilerIncludePath` | Path to compiler-specific include files | `"C:\\TASKING\\TriCore v6.3r1\\ctc\\include"` |
| `pclintplus.useVSCodeIncludes` | Enable integration with VSCode C++ extension paths | `true` |

### Advanced Options

| Setting | Description | Default |
|---------|-------------|---------|
| `pclintplus.preprocessorDefinitions` | List of preprocessor definitions | `[]` |
| `pclintplus.additionalArgs` | Additional command line arguments | `["-b", "-width(240,4)"]` |
| `pclintplus.autoLintOnSave` | Enable automatic linting on file save | `false` |
| `pclintplus.filePatterns` | File patterns to include when linting workspace | `["**/*.c", "**/*.h"]` |
| `pclintplus.excludePatterns` | File patterns to exclude when linting workspace | `["**/node_modules/**", "**/build/**"]` |

## Include Path Architecture

The extension uses a sophisticated **multi-source include path system**:

### 1. **Extension Configuration** (Primary)
```json
{
  "pclintplus.includePaths": [
    "${workspaceFolder}/src/rte_gen",
    "${workspaceFolder}/input/swc_bsw/core",
    // ... extensive predefined paths
  ]
}
```

### 2. **VSCode C++ Integration** (Optional)
Automatically reads from `.vscode/c_cpp_properties.json`:
```json
{
  "configurations": [
    {
      "name": "Win32",
      "includePath": [
        "${workspaceFolder}/**",
        "C:/Program Files/Microsoft Visual Studio/**"
      ]
    }
  ]
}
```

### 3. **Compiler-Specific Paths** (Auto-Added)
```json
{
  "pclintplus.compilerIncludePath": "C:\\TASKING\\TriCore v6.3r1\\ctc\\include"
}
```

### Smart Processing Features:
- ✅ **Variable substitution**: `${workspaceFolder}` → actual workspace path
- ✅ **Existence validation**: Only existing paths are included
- ✅ **Duplicate filtering**: Prevents redundant paths from multiple sources
- ✅ **Platform awareness**: Chooses correct configuration for Windows/Mac/Linux
- ✅ **Temporary config files**: Avoids command line length limitations

## 📝 Example Configuration

### Basic Setup
```json
{
  "pclintplus.executablePath": "C:\\pclint_plus\\windows\\pclp64.exe",
  "pclintplus.repositoryPath": "z:\\SW\\Development\\Deploy",
  "pclintplus.autoLintOnSave": true,
  "pclintplus.useVSCodeIncludes": true
}
```

### Advanced Configuration
```json
{
  "pclintplus.executablePath": "C:\\pclint_plus\\windows\\pclp64.exe",
  "pclintplus.repositoryPath": "z:\\SW\\Development\\Deploy",
  "pclintplus.configFiles": [
    "cfg/pclint_plus/co-tasking.lnt",
    "cfg/pclint_plus/base.lnt",
    "cfg/pclint_plus/au-misra3.lnt",
    "cfg/pclint_plus/options.lnt",
    "cfg/pclint_plus/env-xml.lnt",
    "cfg/pclint_plus/tricore.lnt"
  ],
  "pclintplus.preprocessorDefinitions": [
    "DEBUG",
    "PLATFORM_X86",
    "APPL_BUILD"
  ],
  "pclintplus.autoLintOnSave": true,
  "pclintplus.useVSCodeIncludes": true
}
```

## Usage

### Available Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `PC-Lint Plus: Lint Current File` | Lint the currently open file | Command Palette |
| `PC-Lint Plus: Lint Workspace` | Lint all C/C++ files in the workspace | Command Palette |
| `PC-Lint Plus: Clear Diagnostics` | Clear all lint diagnostics from Problems panel | Command Palette |

Access commands via:
- **Command Palette**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- **Custom Keybindings**: Bind commands to your preferred shortcuts

### Workspace Linting Features
- **Progress Tracking**: Real-time progress with file count and percentage
- **Cancellation Support**: Cancel long-running workspace lints
- **Diagnostic Accumulation**: Issues from all files collected in Problems panel
- **Summary Report**: Final statistics on processed files and found issues

### Auto-Lint on Save
Enable `pclintplus.autoLintOnSave` to automatically lint C/C++ files when saved:
- Only processes lintable files (.c, .cpp, .h, .hpp)
- Respects file type detection
- Provides immediate feedback on code changes

## 🔧 Troubleshooting

### Debug Information
The extension provides comprehensive logging in the **PC-Lint Plus** output channel:
1. Open **View** → **Output**
2. Select **PC-Lint Plus** from the dropdown
3. Review detailed execution logs and error messages

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "PC-Lint Plus executable not found" | Invalid executable path | Check `pclintplus.executablePath` setting |
| "Config file not found" | Missing .lnt configuration files | Verify files exist in specified locations |
| "Unable to open include file" | Missing include directory | Add directory to `pclintplus.includePaths` |
| "Command line too long" error | Excessive include paths | Enable temporary config files (default) |
| No diagnostics in workspace lint | Diagnostic clearing issue | Fixed in latest version |
| System header warnings | TASKING/compiler headers | Automatically filtered out |

### Performance Tips
- **Large Workspaces**: Extension automatically limits to 2000 files for performance
- **Include Path Optimization**: Remove unnecessary paths to speed up linting
- **File Exclusions**: Use `pclintplus.excludePatterns` to skip build directories

## 🏛️ Architecture

### Extension Components
- **Extension Entry Point**: Command registration and VS Code integration
- **LintRunner Class**: Core linting logic and PC-Lint Plus execution
- **Configuration Manager**: Multi-source include path resolution
- **Diagnostic Processor**: XML parsing and VS Code diagnostic creation

### Key Architectural Features
- **Temporary Config Files**: Eliminates command line length limitations
- **Diagnostic Accumulation**: Maintains issues across multiple files in workspace linting
- **Smart Path Resolution**: Combines multiple include path sources intelligently
- **System Header Filtering**: Automatically excludes compiler-specific warnings

## ⚠️ Known Limitations

- **Large Workspaces**: May take significant time to process thousands of files
- **Compiler Constructs**: Some advanced compiler-specific features may not be recognized
- **File Limit**: Workspace linting limited to 2000 files for performance
- **Platform Dependencies**: Paths and executable locations are platform-specific

## 📋 System Requirements

### Supported Platforms
- ✅ **Windows** (Primary development platform)
- ✅ **macOS** (Cross-platform support)
- ✅ **Linux** (Cross-platform support)

### File Type Support
- ✅ **C files** (.c)
- ✅ **C++ files** (.cpp)
- ✅ **Header files** (.h, .hpp)

## 📚 Release Notes

### Latest Version
- ✅ **Fixed**: Command line length errors with temporary config files
- ✅ **Fixed**: Diagnostic accumulation in workspace linting
- ✅ **Added**: Comprehensive Doxygen documentation
- ✅ **Added**: Multi-source include path support
- ✅ **Added**: VSCode C++ extension integration
- ✅ **Added**: System header filtering
- ✅ **Added**: Progress reporting and cancellation
- ✅ **Improved**: Error handling and user feedback

### 0.1.4
- Initial release of the PC-Lint Plus extension
- Support for individual file and workspace linting
- Integration with VS Code Problems panel
- Configuration options for paths and settings

## 📄 License

This extension is licensed under the **MIT License**.

## 🤝 Contributing

Contributions are welcome! Please feel free to:
- 🐛 **Submit Issues**: Report bugs or request features
- 🔧 **Pull Requests**: Contribute code improvements
- 📖 **Documentation**: Help improve documentation
- 🧪 **Testing**: Test on different platforms and configurations

## 🛠️ Development Environment

### Prerequisites
- **Node.js** 14.x or higher
- **npm** 6.x or higher (or **yarn** 1.x)
- **Visual Studio Code** 1.60.0 or newer
- **TypeScript** 4.4.0 or higher (installed globally recommended)
- **Git** for version control

### Quick Start
```bash
# Clone the repository
git clone <repository-url>
cd vscode-pclint-plus

# Install dependencies
npm install

# Open in VS Code
code .

# Launch extension development host
# Press F5 or run "Extension: Start Debugging"
```

### 📁 Project Structure
```
vscode-pclint-plus/
├── src/                    # TypeScript source files
│   ├── extension.ts        # Main extension entry point
│   └── lintRunner.ts       # Core linting functionality
├── out/                    # Compiled JavaScript output
├── images/                 # Extension icons and assets
├── assets/                 # Demo images and videos
├── package.json            # Extension manifest and dependencies
├── tsconfig.json          # TypeScript configuration
├── .vscode/               # VS Code workspace settings
│   ├── launch.json        # Debug configuration
│   └── tasks.json         # Build tasks
├── .vscodeignore          # Files excluded from packaging
└── README.md              # This documentation
```

### 🏗️ Local Compilation

#### Method 1: Using npm Scripts
```bash
# Install dependencies (if not done already)
npm install

# Compile TypeScript to JavaScript
npm run compile

# Watch mode for development (auto-recompile on changes)
npm run watch

# Clean and rebuild
npm run clean && npm run compile
```

#### Method 2: Using TypeScript Compiler Directly
```bash
# Install TypeScript globally (if not installed)
npm install -g typescript

# Compile once
tsc -p ./

# Watch mode
tsc -watch -p ./

# Check for compilation errors
tsc --noEmit -p ./
```

#### Method 3: Using VS Code Tasks
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Tasks: Run Task`
3. Select:
   - `npm: compile` - Single compilation
   - `npm: watch` - Continuous compilation
   - `typescript: build` - TypeScript build task

### 🧪 Testing & Debugging

#### Debug Extension in Development Host
```bash
# Method 1: VS Code Debug
1. Open the project in VS Code
2. Go to Run and Debug view (Ctrl+Shift+D)
3. Select "Launch Extension" configuration
4. Press F5 or click the green play button
5. New Extension Development Host window opens
6. Test your extension in the development host

# Method 2: Command Line
npm run debug
```

#### Debug Configuration (`.vscode/launch.json`)
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

#### Testing with Sample Projects
```bash
# Create test workspace
mkdir test-workspace
cd test-workspace

# Create sample C files
echo '#include <stdio.h>\nint main() { return 0; }' > test.c
echo '#ifndef TEST_H\n#define TEST_H\nint test_func();\n#endif' > test.h

# Configure PC-Lint Plus settings in VS Code
# Test single file and workspace linting
```

### 📦 Building & Packaging

#### Install vsce (Visual Studio Code Extension Manager)
```bash
npm install -g vsce
```

#### Package Extension
```bash
# Package for distribution (.vsix file)
vsce package

# Package with specific version
vsce package --patch
vsce package --minor
vsce package --major

# Pre-release version
vsce package --pre-release
```

#### Install Packaged Extension Locally
```bash
# Install the .vsix file
code --install-extension vscode-pclint-plus-*.vsix

# Or via VS Code UI:
# 1. Open Extensions view (Ctrl+Shift+X)
# 2. Click "..." menu → "Install from VSIX..."
# 3. Select your .vsix file
```

### 🔧 Development Scripts

Add these scripts to your `package.json`:
```json
{
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "clean": "rimraf out",
    "lint": "eslint src --ext ts",
    "lint:fix": "eslint src --ext ts --fix",
    "package": "vsce package",
    "publish": "vsce publish",
    "debug": "code --extensionDevelopmentPath=${PWD}"
  }
}
```

### Development Workflow

#### Daily Development Cycle
```bash
# 1. Start development session
npm run watch          # Terminal 1: Continuous compilation
code .                 # Open VS Code
# Press F5             # Launch Extension Development Host

# 2. Make changes to TypeScript files
# 3. Changes auto-compile (watch mode)
# 4. Reload Extension Development Host (Ctrl+R)
# 5. Test changes
# 6. Repeat steps 2-5

# 7. Before committing
npm run lint           # Check code style
npm run compile        # Final compilation check
npm test               # Run tests (if available)
```

#### Code Quality Tools
```bash
# Install development dependencies
npm install --save-dev @types/vscode @types/node eslint typescript

# ESLint configuration (.eslintrc.json)
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/explicit-function-return-type": "off"
  }
}
```

### Publishing Workflow

#### Prepare for Release
```bash
# 1. Update version in package.json
npm version patch|minor|major

# 2. Update CHANGELOG.md
# Document new features, fixes, breaking changes

# 3. Build and test
npm run compile
npm run lint
vsce package

# 4. Test the packaged extension
code --install-extension vscode-pclint-plus-*.vsix

# 5. Publish to marketplace
vsce publish
```

#### CI/CD Setup (GitHub Actions Example)
```yaml
# .github/workflows/build.yml
name: Build and Test
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
      - run: npm install
      - run: npm run compile
      - run: npm run lint
      - run: npm run package
```

### 🔍 Debugging Tips

#### Common Development Issues
```bash
# TypeScript compilation errors
tsc --noEmit -p ./      # Check for type errors

# Extension not loading
# Check VS Code Developer Console (Help → Toggle Developer Tools)

# Include path issues
# Test with absolute paths first
# Check file existence with fs.existsSync()

# PC-Lint Plus execution issues
# Test command manually in terminal
# Check executable permissions on Linux/Mac
```

#### Debugging PC-Lint Plus Integration
```typescript
// Add debug logging to lintRunner.ts
this.outputChannel.appendLine(`Debug: Command = ${fullCommand}`);
this.outputChannel.appendLine(`Debug: Working Dir = ${process.cwd()}`);
this.outputChannel.appendLine(`Debug: Args = ${JSON.stringify(args)}`);
```

### Useful Development Resources

#### VS Code Extension Development
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

#### TypeScript Resources
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [VS Code Types](https://www.npmjs.com/package/@types/vscode)

#### PC-Lint Plus Integration
- [PC-Lint Plus Documentation](https://pclintplus.com/)
- [XML Output Format Reference](https://pclintplus.com/xml-format)

### Development Best Practices

1. **Always run in watch mode** during development
2. **Test both single file and workspace linting** after changes
3. **Use the output channel** for debugging information
4. **Test with different PC-Lint Plus configurations**
5. **Verify cross-platform compatibility** (Windows/Mac/Linux paths)
6. **Profile performance** with large workspaces
7. **Handle errors gracefully** with user-friendly messages
8. **Document complex logic** with JSDoc/Doxygen comments

## 🔗 Links

- **GitHub Repository**: [Link to your repository]
- **VS Code Marketplace**: [Link to marketplace page]
- **PC-Lint Plus Documentation**: [Link to PC-Lint Plus docs]
- **Issue Tracker**: [Link to issues page]

---

**Made for C/C++ developers using PC-Lint Plus**
