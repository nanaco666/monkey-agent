#!/usr/bin/env swift
// macOS Vision OCR - reads an image file and outputs recognized text
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: ocr <image_path>\n", stderr)
    exit(1)
}

let path = CommandLine.arguments[1]
let url: URL

if path.hasPrefix("http://") || path.hasPrefix("https://") {
    // Download from URL
    guard let remoteUrl = URL(string: path),
          let data = try? Data(contentsOf: remoteUrl),
          let image = NSImage(data: data),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("Error: failed to load image from URL\n", stderr)
        exit(1)
    }
    performOCR(on: cgImage)
} else {
    // Local file
    url = URL(fileURLWithPath: path)
    guard let data = try? Data(contentsOf: url),
          let image = NSImage(data: data),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("Error: failed to load image from \(path)\n", stderr)
        exit(1)
    }
    performOCR(on: cgImage)
}

func performOCR(on cgImage: CGImage) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja", "ko"]
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        fputs("Error: OCR failed - \(error.localizedDescription)\n", stderr)
        exit(1)
    }

    guard let observations = request.results else {
        print("")
        exit(0)
    }

    let text = observations.compactMap { observation in
        observation.topCandidates(1).first?.string
    }.joined(separator: "\n")

    print(text)
}
