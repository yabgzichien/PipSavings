package com.pip.mlkit

import android.app.Activity
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.concurrent.thread
import kotlin.math.abs

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i("MLKitBench", "Starting ML Kit benchmark Activity...")

        thread {
            try {
                runBenchmark()
            } catch (e: Exception) {
                Log.e("MLKitBench", "Benchmark error", e)
            } finally {
                finish()
            }
        }
    }

    private fun runBenchmark() {
        val imagesDir = File("/data/local/tmp/images_test")
        val outputFile = File(filesDir, "mlkit_results.json")
        val doneFile = File(filesDir, "BENCHMARK_FINISHED")

        if (doneFile.exists()) doneFile.delete()

        // Chinese recognizer recognizes both Chinese and Latin characters
        val chineseRecognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        // Latin-only recognizer
        val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        val imageFiles = listOf(
            "1000105419.jpg",
            "1000105421.jpg",
            "1000105423.jpg",
            "tngscreenshot.png",
            "pasted_image.png"
        )

        val rootJson = JSONObject()

        for (filename in imageFiles) {
            val file = File(imagesDir, filename)
            if (!file.exists()) {
                Log.w("MLKitBench", "File not found: ${file.absolutePath}")
                continue
            }

            Log.i("MLKitBench", "Processing ${file.name} (${file.length()} bytes)...")
            // Full resolution, no downsampling  isolating whether the earlier ~1200px cap
            // was the source of the garbled OCR reads, per the request to re-test at full res.
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = 1
            }
            val bitmap = BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
            if (bitmap == null) {
                Log.e("MLKitBench", "Failed to decode bitmap: ${file.name}")
                continue
            }
            Log.i("MLKitBench", "  Decoded bitmap: ${bitmap.width}x${bitmap.height} (full resolution)")

            val inputImage = InputImage.fromBitmap(bitmap, 0)

            // Warmup / recognizer selection:
            // For Chinese receipt (1000105421.jpg), use Chinese recognizer.
            // For others, we can test ChineseRecognizer (since it handles Latin too)
            // or compare Latin vs Chinese! Let's use Chinese recognizer across all or appropriate ones.
            val recognizer = if (filename == "1000105421.jpg") chineseRecognizer else chineseRecognizer

            // Measure inference time
            val t0 = System.nanoTime()
            val textResult = Tasks.await(recognizer.process(inputImage))
            val latencyMs = (System.nanoTime() - t0) / 1_000_000.0

            Log.i("MLKitBench", "Finished ${file.name} in ${latencyMs} ms. Found ${textResult.textBlocks.size} blocks.")

            // Extract all lines with bounding boxes
            data class LineInfo(val text: String, val box: Rect?, val top: Int, val left: Int, val bottom: Int)
            val allLines = mutableListOf<LineInfo>()

            val blocksArray = JSONArray()
            for (block in textResult.textBlocks) {
                val blockJson = JSONObject()
                blockJson.put("text", block.text)
                block.boundingBox?.let { b ->
                    blockJson.put("box", JSONObject().apply {
                        put("left", b.left)
                        put("top", b.top)
                        put("right", b.right)
                        put("bottom", b.bottom)
                    })
                }

                val linesArray = JSONArray()
                for (line in block.lines) {
                    val lineJson = JSONObject()
                    lineJson.put("text", line.text)
                    val b = line.boundingBox
                    if (b != null) {
                        lineJson.put("box", JSONObject().apply {
                            put("left", b.left)
                            put("top", b.top)
                            put("right", b.right)
                            put("bottom", b.bottom)
                        })
                        allLines.add(LineInfo(line.text, b, b.top, b.left, b.bottom))
                    } else {
                        allLines.add(LineInfo(line.text, null, 0, 0, 0))
                    }
                    linesArray.put(lineJson)
                }
                blockJson.put("lines", linesArray)
                blocksArray.put(blockJson)
            }

            // Spatial row reconstruction:
            // Cluster lines that share similar vertical Y-positions (within 1/2 of line height),
            // then sort lines inside each row by X-position (left to right).
            allLines.sortBy { it.top }
            val rows = mutableListOf<MutableList<LineInfo>>()
            for (line in allLines) {
                var placed = false
                for (row in rows) {
                    val avgTop = row.map { it.top }.average()
                    val avgHeight = row.map { it.bottom - it.top }.average()
                    val threshold = if (avgHeight > 0) avgHeight * 0.6 else 15.0
                    if (abs(line.top - avgTop) < threshold) {
                        row.add(line)
                        placed = true
                        break
                    }
                }
                if (!placed) {
                    rows.add(mutableListOf(line))
                }
            }

            val spatialLines = mutableListOf<String>()
            for (row in rows) {
                row.sortBy { it.left }
                spatialLines.add(row.joinToString("    ") { it.text })
            }
            val spatialText = spatialLines.joinToString("\n")

            val imgJson = JSONObject().apply {
                put("file", filename)
                put("width", bitmap.width)
                put("height", bitmap.height)
                put("latency_ms", latencyMs)
                put("raw_text", textResult.text)
                put("spatial_text", spatialText)
                put("blocks", blocksArray)
            }

            rootJson.put(filename, imgJson)
            bitmap.recycle()

            // Write partial results after each image so we keep data even if we crash later
            FileOutputStream(outputFile).use { fos ->
                fos.write(rootJson.toString(2).toByteArray(Charsets.UTF_8))
            }
            Log.i("MLKitBench", "Partial results written after $filename")
        }

        FileOutputStream(doneFile).use { fos ->
            fos.write("OK\n".toByteArray(Charsets.UTF_8))
        }

        Log.i("MLKitBench", "Benchmark completed successfully! Results written to ${outputFile.absolutePath}")
    }
}
