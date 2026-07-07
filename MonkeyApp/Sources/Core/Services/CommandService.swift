import Foundation

/// Handles slash command parsing and execution
struct CommandService {
    /// Parse and return the action for a slash command
    enum CommandAction {
        case clear
        case setWild
        case setTame
        case showModel
        case showUsage
        case forwardToChat(String)  // send to LLM as-is
    }

    static func parse(_ input: String) -> CommandAction {
        let cmd = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch cmd {
        case "/clear": return .clear
        case "/wild":  return .setWild
        case "/tame":  return .setTame
        case "/model": return .showModel
        case "/usage": return .showUsage
        default:       return .forwardToChat(input)
        }
    }
}
