// vidocr.swift — extract frames from a video and OCR them with Apple Vision.
// Usage: swift scripts/vidocr.swift <video-path> [step-seconds]
import Foundation
import AVFoundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count >= 2 else {
    print("usage: swift scripts/vidocr.swift <video> [step] [startSec]")
    exit(2)
}
let path = args[1]
let step = args.count > 2 ? Double(args[2]) ?? 6.0 : 6.0
let startSec = args.count > 3 ? Double(args[3]) ?? 0.0 : 0.0

let url = URL(fileURLWithPath: path)
let asset = AVURLAsset(url: url)

// Load duration (sync API — the async variant fails for some sandboxed files).
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite && duration > 0 else {
    print("ERROR: could not read duration")
    exit(1)
}
print("DURATION \(String(format: "%.1f", duration))s step=\(step)s")

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = CMTime(seconds: 0.8, preferredTimescale: 600)
generator.requestedTimeToleranceAfter = CMTime(seconds: 0.8, preferredTimescale: 600)
generator.maximumSize = CGSize(width: 1600, height: 1600)

var lastText = ""
var framesWithText = 0

let total = Int(max(1, (duration - startSec) / step))
for i in 0...total {
    let sec = startSec + Double(i) * step
    if sec > duration { break }
    let time = CMTime(seconds: sec, preferredTimescale: 600)

    var cgImage: CGImage?
    let sem = DispatchSemaphore(value: 0)
    generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: time)]) { _, image, _, _, _ in
        cgImage = image
        sem.signal()
    }
    _ = sem.wait(timeout: .distantFuture)
    guard let img = cgImage else { continue }

    var observations: [VNRecognizedTextObservation] = []
    let req = VNRecognizeTextRequest { r, _ in
        observations = (r.results as? [VNRecognizedTextObservation]) ?? []
    }
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: img, options: [:])
    try? handler.perform([req])

    var lines: [String] = []
    for o in observations {
        if let top = o.topCandidates(1).first {
            lines.append(top.string)
        }
    }
    let text = lines.joined(separator: "\n")

    if text != lastText && !lines.isEmpty {
        framesWithText += 1
        print("=== FRAME \(String(format: "%.0f", sec))s ===")
        print(text)
        lastText = text
    }
}
print("DONE frames_with_text=\(framesWithText)")