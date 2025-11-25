// worker-buffer.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/spark-md5/3.0.2/spark-md5.min.js');

self.onmessage = function (e) {
  const { index, buffer } = e.data; // buffer 是 ArrayBuffer（已 transfer）

  try {
    // SparkMD5 直接支持 ArrayBuffer
    const hash = SparkMD5.ArrayBuffer.hash(buffer);
    self.postMessage({ success: true, index, hash });
  } catch (error) {
    self.postMessage({ success: false, index, error: error.message });
  }
};