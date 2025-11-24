const express = require('express');
const cors = require('cors');
const multer = require('multer');
const app = express();

app.use(cors());

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // 上传文件保存目录
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname) // 文件名格式
  }
});

const upload = multer({ storage: storage });

const hostname = '127.0.0.1';
const port = 3000;

// 创建上传目录
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

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

app.post('/upload', upload.single('chunk'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      code: 400,
      message: '没有选择文件'
    });
  }
  
  res.status(200).json({
    code: 200,
    message: '上传成功',
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size
  });
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});