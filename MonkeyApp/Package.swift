// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "MonkeyApp",
    platforms: [.macOS(.v26)],
    products: [
        .executable(name: "MonkeyApp", targets: ["MonkeyApp"]),
    ],
    targets: [
        .executableTarget(
            name: "MonkeyApp",
            path: "Sources",
            exclude: [],
            resources: [
                .process("../Resources")
            ]
        ),
    ]
)
