// public/hash.worker.js （放在 public 目录下）
importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');

// self.onmessage = async (e) => {
//   const { chunks, chunkSize } = e.data;
//   const spark = new SparkMD5.ArrayBuffer();
  
//   for (let i = 0; i < chunks.length; i++) {
//     // 模拟从主进程接收分片（实际需通过 transferable objects 传递）
//     // 注意：Worker 不能直接访问 File/Blob，需主进程传 ArrayBuffer
//     const buffer = chunks[i]; // 假设主进程已传入 ArrayBuffer 数组
    
//     spark.append(buffer);
    
//     // 定期报告进度（避免频繁 postMessage）
//     if (i % 10 === 0 || i === chunks.length - 1) {
//       self.postMessage({
//         type: 'progress',
//         percent: Math.round(((i + 1) / chunks.length) * 100)
//       });
//     }
//   }
  
//   self.postMessage({
//     type: 'complete',
//     hash: spark.end()
//   });
// };

let spark = new SparkMD5.ArrayBuffer();
let expectedCount = 0;
let receivedCount = 0;

self.onmessage = (e) => {
  if (e.data.type === 'chunk') {
    spark.append(e.data.buffer);
    receivedCount++;
  } else if (e.data.type === 'finish') {
    self.postMessage({ type: 'hash', hash: spark.end() });
    spark = null; // 清理内存
  }
};