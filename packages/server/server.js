const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const hostname = '127.0.0.1';
const port = 3000;

// 目录配置 - 使用绝对路径，基于服务器文件所在目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CHUNK_DIR = path.join(UPLOAD_DIR, 'chunks');
const MERGED_DIR = path.join(UPLOAD_DIR, 'merged');

// 创建必要的目录
[UPLOAD_DIR, CHUNK_DIR, MERGED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

console.log('上传目录配置:');
console.log('UPLOAD_DIR:', UPLOAD_DIR);
console.log('CHUNK_DIR:', CHUNK_DIR);
console.log('MERGED_DIR:', MERGED_DIR);

// 配置 multer 使用内存存储，然后手动保存文件
// 这样可以确保在 req.body 解析完成后再保存到正确位置
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 限制单个文件最大 100MB
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        code: 400,
        message: '字段名不匹配，请检查文件字段名是否为chunk'
      });
    }
  }
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: error.message
  });
});

// 上传分片接口
app.post('/upload', upload.single('chunk'), (req, res) => {
  console.log('收到上传请求:', {
    hasFile: !!req.file,
    fileInfo: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer ? req.file.buffer.length : 0
    } : null,
    body: req.body
  });
  
  if (!req.file) {
    return res.status(400).json({
      code: 400,
      message: '没有选择文件'
    });
  }
  
  const hash = req.body.hash;
  const fileName = req.body.fileName;
  
  if (!hash) {
    return res.status(400).json({
      code: 400,
      message: '缺少 hash 参数'
    });
  }
  
  // 提取文件hash用于创建目录
  // hash 格式: ${fileHash}-${index}-${fileName}
  const fileHash = hash.includes('-') ? hash.split('-')[0] : hash;
  const chunkDir = path.join(CHUNK_DIR, fileHash);
  
  // 创建分片目录（如果不存在）
  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true });
  }
  
  // 目标文件路径
  const targetPath = path.join(chunkDir, hash);
  
  // 检查文件 buffer 是否存在（使用 memoryStorage 时）
  if (!req.file.buffer) {
    console.error('文件 buffer 不存在');
    return res.status(500).json({
      code: 500,
      message: '文件上传失败，文件数据不存在'
    });
  }
  
  // 直接将 buffer 写入目标文件
  try {
    // 如果目标文件已存在，先删除
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    
    // 写入文件
    fs.writeFileSync(targetPath, req.file.buffer);
    
    console.log('分片上传成功:', {
      hash,
      fileName,
      fileHash,
      savedPath: targetPath,
      size: req.file.size,
      bufferSize: req.file.buffer.length
    });
    
    res.status(200).json({
      code: 200,
      message: '上传成功',
      hash: hash,
      filename: hash,
      originalname: fileName,
      size: req.file.size
    });
  } catch (error) {
    console.error('保存文件失败:', error);
    console.error('目标文件路径:', targetPath);
    console.error('目标目录是否存在:', fs.existsSync(chunkDir));
    
    res.status(500).json({
      code: 500,
      message: '保存文件失败',
      error: error.message,
      debug: {
        targetPath: targetPath,
        targetDirExists: fs.existsSync(chunkDir),
        bufferSize: req.file.buffer ? req.file.buffer.length : 0
      }
    });
  }
});

// 检查文件是否已存在（用于秒传）
app.post('/check', (req, res) => {
  const { hash, fileName } = req.body;
  
  if (!hash || !fileName) {
    return res.status(400).json({
      code: 400,
      message: '缺少必要参数：hash 和 fileName'
    });
  }
  
  // 提取文件hash
  const fileHash = hash.includes('-') ? hash.split('-')[0] : hash;
  const mergedFilePath = path.join(MERGED_DIR, `${fileHash}-${fileName}`);
  
  // 检查完整文件是否存在
  if (fs.existsSync(mergedFilePath)) {
    const stats = fs.statSync(mergedFilePath);
    return res.status(200).json({
      code: 200,
      message: '文件已存在',
      exists: true,
      filePath: mergedFilePath,
      fileName: fileName,
      size: stats.size,
      hash: fileHash
    });
  }
  
  // 文件不存在
  res.status(200).json({
    code: 200,
    message: '文件不存在',
    exists: false
  });
});

// 验证分片接口（用于断点续传）
app.post('/verify', (req, res) => {
  const { hash, fileName, chunkCount } = req.body;
  
  if (!hash || !fileName) {
    return res.status(400).json({
      code: 400,
      message: '缺少必要参数：hash 和 fileName'
    });
  }
  
  const fileHash = hash.split('-')[0];
  const chunkDir = path.join(CHUNK_DIR, fileHash);
  
  // 检查分片目录是否存在
  if (!fs.existsSync(chunkDir)) {
    return res.status(200).json({
      code: 200,
      message: '分片目录不存在',
      uploadedChunks: [],
      shouldUpload: true
    });
  }
  
  // 读取已上传的分片
  const uploadedChunks = fs.readdirSync(chunkDir)
    .filter(file => file.startsWith(fileHash))
    .map(file => {
      // 解析分片索引：${hash}-${index}-${fileName}
      const parts = file.split('-');
      return parseInt(parts[1]);
    })
    .sort((a, b) => a - b);
  
  // 检查是否所有分片都已上传
  const allChunksUploaded = chunkCount && uploadedChunks.length === chunkCount;
  
  res.status(200).json({
    code: 200,
    message: '验证成功',
    uploadedChunks: uploadedChunks,
    shouldUpload: !allChunksUploaded,
    isComplete: allChunksUploaded
  });
});

// 合并分片接口
app.post('/merge', async (req, res) => {
  const { hash, fileName, chunkCount } = req.body;
  
  if (!hash || !fileName || !chunkCount) {
    return res.status(400).json({
      code: 400,
      message: '缺少必要参数：hash、fileName 和 chunkCount'
    });
  }
  
  // 提取文件hash（如果hash包含-，取第一部分；否则就是完整的hash）
  const fileHash = hash.includes('-') ? hash.split('-')[0] : hash;
  const chunkDir = path.join(CHUNK_DIR, fileHash);
  const mergedFilePath = path.join(MERGED_DIR, `${fileHash}-${fileName}`);
  
  console.log('合并请求:', { hash, fileName, chunkCount, fileHash, chunkDir });
  
  try {
    // 检查分片目录是否存在
    if (!fs.existsSync(chunkDir)) {
      console.error('分片目录不存在:', chunkDir);
      return res.status(400).json({
        code: 400,
        message: '分片目录不存在',
        debug: {
          fileHash,
          chunkDir,
          chunkDirExists: fs.existsSync(chunkDir)
        }
      });
    }
    
    // 读取所有分片文件
    const chunks = [];
    const missingChunks = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const chunkPath = path.join(chunkDir, `${fileHash}-${i}-${fileName}`);
      if (!fs.existsSync(chunkPath)) {
        missingChunks.push(i);
        console.error(`分片 ${i} 不存在:`, chunkPath);
      } else {
        chunks.push(chunkPath);
      }
    }
    
    // 如果有缺失的分片，返回错误
    if (missingChunks.length > 0) {
      return res.status(400).json({
        code: 400,
        message: `分片缺失: ${missingChunks.join(', ')}`,
        missingChunks: missingChunks,
        uploadedCount: chunks.length,
        totalCount: chunkCount
      });
    }
    
    // 合并分片
    const writeStream = fs.createWriteStream(mergedFilePath);
    
    for (const chunkPath of chunks) {
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // 等待写入完成
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // 获取合并后的文件信息
    const stats = fs.statSync(mergedFilePath);
    
    res.status(200).json({
      code: 200,
      message: '合并成功',
      filePath: mergedFilePath,
      fileName: fileName,
      size: stats.size,
      hash: fileHash
    });
  } catch (error) {
    console.error('合并文件失败:', error);
    res.status(500).json({
      code: 500,
      message: '合并文件失败',
      error: error.message
    });
  }
});

// 查询上传进度接口
app.get('/progress/:hash', (req, res) => {
  const { hash } = req.params;
  const fileHash = hash.split('-')[0];
  const chunkDir = path.join(CHUNK_DIR, fileHash);
  
  if (!fs.existsSync(chunkDir)) {
    return res.status(200).json({
      code: 200,
      uploadedCount: 0,
      totalCount: 0,
      progress: 0
    });
  }
  
  const uploadedChunks = fs.readdirSync(chunkDir)
    .filter(file => file.startsWith(fileHash));
  
  res.status(200).json({
    code: 200,
    uploadedCount: uploadedChunks.length,
    uploadedChunks: uploadedChunks.map(file => {
      const parts = file.split('-');
      return parseInt(parts[1]);
    }).sort((a, b) => a - b)
  });
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});