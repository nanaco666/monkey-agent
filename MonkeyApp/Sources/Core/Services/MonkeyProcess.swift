import Foundation

/// Manages the Monkey CLI child process lifecycle
final class MonkeyProcess: @unchecked Sendable {
    private var process: Process?
    private var inputPipe: Pipe?
    private var outputPipe: Pipe?
    private var errorPipe: Pipe?

    var isRunning: Bool { process?.isRunning == true }

    /// Kill any leftover `node ... app` processes from previous app sessions
    private func killStaleAppProcesses() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        task.arguments = ["-f", "monkey-cli/dist/index.js app"]
        // Ignore errors (no matches = exit code 1)
        try? task.run()
        task.waitUntilExit()
    }

    /// Start the process, returns the output FileHandle for reading and input FileHandle for writing
    func start(cliPath: String) -> (readHandle: FileHandle, writeHandle: FileHandle)? {
        // Clean up any zombie processes from previous sessions
        killStaleAppProcesses()

        guard process == nil else { return nil }

        let proc = Process()
        let output = Pipe()
        let input = Pipe()
        let error = Pipe()

        proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        proc.arguments = ["node", cliPath, "app"]
        proc.currentDirectoryURL = URL(fileURLWithPath: NSHomeDirectory())
        proc.standardOutput = output
        proc.standardError = error
        proc.standardInput = input

        // Forward stderr for debugging
        error.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if !data.isEmpty, let str = String(data: data, encoding: .utf8), !str.isEmpty {
                fputs(str, stderr)
            }
        }

        do {
            try proc.run()
            self.process = proc
            self.inputPipe = input
            self.outputPipe = output
            self.errorPipe = error
            return (output.fileHandleForReading, input.fileHandleForWriting)
        } catch {
            return nil
        }
    }

    func terminate() {
        process?.terminate()
        process = nil
        inputPipe = nil
        outputPipe = nil
        errorPipe = nil
    }

    /// Resolve the CLI path
    static func findCliPath() -> String {
        let localBuild = NSHomeDirectory() + "/monkey-cli/dist/index.js"
        if FileManager.default.fileExists(atPath: localBuild) {
            return localBuild
        }
        for path in ["/opt/homebrew/bin/monkey", "/usr/local/bin/monkey"] {
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        return "/opt/homebrew/bin/monkey"
    }
}
