import SwiftUI

/// Chat transcript scroller with smart auto-scroll, turn anchoring,
/// message grouping, and a "Jump to Latest" button.
struct MessageListView: View {
    let messages: [ChatMessage]
    let scrollState: ChatScrollState
    var assistantName: String = "Monkey"

    private var grouped: [(message: ChatMessage, showAvatar: Bool, isGrouped: Bool)] {
        MessageGroupBuilder.group(messages)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            scrollContent
            jumpToLatestButton
        }
    }

    private var scrollContent: some View {
        ScrollViewReader { proxy in
            TrackableScrollView(
                onScroll: { offset, contentHeight, viewportHeight in
                    scrollState.updateFromScroll(
                        offset: offset,
                        contentHeight: contentHeight,
                        viewportHeight: viewportHeight
                    )
                }
            ) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Color.clear.frame(height: 16)

                    if messages.isEmpty {
                        WelcomeView(assistantName: assistantName)
                            .frame(maxWidth: .infinity)
                    } else {
                        ForEach(grouped, id: \.message.id) { item in
                            MessageRow(
                                message: item.message,
                                showAvatar: item.showAvatar,
                                isGrouped: item.isGrouped
                            )
                            .id(item.message.id)
                        }
                    }

                    Color.clear.frame(height: 16)
                }
            }
            .onChange(of: messages.count) { oldCount, newCount in
                guard newCount > oldCount else { return }
                if scrollState.isFollowing {
                    withAnimation(Theme.Animation.scroll) {
                        proxy.scrollTo(messages.last?.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: messages.last?.content) {
                if scrollState.isFollowing {
                    withAnimation(Theme.Animation.scroll) {
                        proxy.scrollTo(messages.last?.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var jumpToLatestButton: some View {
        Group {
            if !scrollState.isAtBottom {
                Button {
                    scrollState.engageFollowing()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.down")
                        Text("Latest")
                    }
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                }
                .buttonStyle(.glass(.regular))
                .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
                .padding(.bottom, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(Theme.Animation.fade, value: scrollState.isAtBottom)
    }
}

// MARK: - Trackable ScrollView

struct TrackableScrollView<Content: View>: View {
    let onScroll: (_ offset: CGFloat, _ contentHeight: CGFloat, _ viewportHeight: CGFloat) -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            ZStack(alignment: .top) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("scrollTrack")).minY
                    )
                }
                .frame(height: 0)

                content()
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: ContentHeightPreferenceKey.self,
                                value: geo.size.height
                            )
                        }
                    )
            }
        }
        .coordinateSpace(name: "scrollTrack")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
            lastOffset = offset
            reportScroll()
        }
        .onPreferenceChange(ContentHeightPreferenceKey.self) { height in
            lastContentHeight = height
            reportScroll()
        }
        .onAppear {
            reportScroll()
        }
    }

    @State private var lastOffset: CGFloat = 0
    @State private var lastContentHeight: CGFloat = 0

    private func reportScroll() {
        let adjustedOffset = -lastOffset
        onScroll(adjustedOffset, lastContentHeight, 0)
    }
}

private struct ScrollOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct ContentHeightPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
