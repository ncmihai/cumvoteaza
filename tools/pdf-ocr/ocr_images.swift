// Reads the text of page images with macOS's Vision framework (accurate mode, no language correction, so that numbers are kept as printed).
//
//   swiftc -O tools/pdf-ocr/ocr_images.swift -o /tmp/ocr_images && /tmp/ocr_images a.jpg b.jpg > out.jsonl
//
// One JSON line per image: {"file": "...", "lines": [{"text": "...", "x": 0.1, "y": 0.9, "w": 0.3, "h": 0.02, "confidence": 0.99}]}, top to bottom (y is the distance from the top, 0 to 1).
import Foundation
import Vision
import AppKit

struct Line: Codable { let text: String; let x: Double; let y: Double; let w: Double; let h: Double; let confidence: Float }
struct Page: Codable { let file: String; let lines: [Line] }

let encoder = JSONEncoder()
for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    // The neural engine path fails in some sandboxes (e5rt errors); the CPU path is slower and always works.
    request.usesCPUOnly = true
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([request]) } catch { FileHandle.standardError.write("vision failed on \(path): \(error)\n".data(using: .utf8)!) }
    var lines: [Line] = []
    for observation in request.results ?? [] {
        guard let best = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        lines.append(Line(text: best.string, x: Double(box.minX), y: Double(1 - box.maxY), w: Double(box.width), h: Double(box.height), confidence: best.confidence))
    }
    lines.sort { abs($0.y - $1.y) > 0.01 ? $0.y < $1.y : $0.x < $1.x }
    let page = Page(file: (path as NSString).lastPathComponent, lines: lines)
    print(String(data: try! encoder.encode(page), encoding: .utf8)!)
}
