import SwiftUI

/// ASCII thinking indicator: cycles through . ➔ v ➔ ♥ ➔ O ➔ .
/// Shown while the agent is processing but hasn't produced output yet.
/// Disappears as soon as streaming text arrives.
struct ThinkingIndicator: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var frameIndex: Int = 0

    private let frames: [String] = ["·", "✢", "✳", "✿", "✳", "✢"]
    private let frameDuration: Double = 0.35

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Color.clear
                .frame(width: Theme.Avatar.md)

            Text(frames[frameIndex])
                .font(.system(size: 20, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { _ in
                frameIndex = (frameIndex + 1) % frames.count
            }
        }
    }
}
