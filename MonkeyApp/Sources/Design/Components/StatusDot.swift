import SwiftUI

/// Connection status indicator dot with pulse animation
struct StatusDot: View {
    let isConnected: Bool
    var size: CGFloat = 8

    @State private var isPulsing = false

    var body: some View {
        ZStack {
            if isConnected {
                Circle()
                    .fill(Color.green.opacity(0.3))
                    .frame(width: size * 2, height: size * 2)
                    .scaleEffect(isPulsing ? 1.2 : 1.0)
                    .opacity(isPulsing ? 0 : 0.6)
                    .onAppear {
                        withAnimation(.easeOut(duration: 2.0).repeatForever(autoreverses: false)) {
                            isPulsing = true
                        }
                    }
            }

            Circle()
                .fill(isConnected ? Color.green : Color.orange)
                .frame(width: size, height: size)
        }
    }
}
