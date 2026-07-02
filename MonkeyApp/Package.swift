// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonkeyApp",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "MonkeyApp", targets: ["MonkeyApp"]),
    ],
    targets: [
        .executableTarget(
            name: "MonkeyApp",
            path: "Sources"
        ),
    ]
)
