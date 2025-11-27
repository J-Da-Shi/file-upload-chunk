# 文件上传服务 - 断点续传系统

一个支持大文件分片上传和断点续传的 Node.js 服务端系统。

## 功能特性

- ✅ **分片上传**：支持大文件分片上传，默认分片大小为 1MB
- ✅ **断点续传**：支持上传中断后继续上传，自动跳过已上传的分片
- ✅ **多核并行**：前端使用 Web Workers 并行计算文件哈希
- ✅ **进度查询**：实时查询文件上传进度
- ✅ **文件合并**：所有分片上传完成后自动合并为完整文件

## 目录结构

```
uploads/
├── chunks/          # 分片存储目录
│   └── {fileHash}/  # 每个文件的分片目录
│       └── {hash}-{index}-{fileName}  # 分片文件
└── merged/          # 合并后的完整文件
    └── {fileHash}-{fileName}
```

## 技术栈

- **后端**：Node.js + Express + Multer
- **前端**：React + Vite + Ant Design
- **哈希算法**：SparkMD5

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务将在 `http://127.0.0.1:3000` 启动

## API 接口文档

### 基础信息

- **Base URL**: `http://127.0.0.1:3000`
- **Content-Type**: `multipart/form-data` (上传接口) / `application/json` (其他接口)

---

### 1. 上传分片

上传文件的一个分片。

**接口地址**: `POST /upload`

**请求方式**: `multipart/form-data`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| chunk | File | 是 | 文件分片 |
| hash | String | 是 | 分片标识，格式：`{fileHash}-{index}-{fileName}` |
| fileName | String | 是 | 原始文件名 |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('chunk', chunkFile);
formData.append('hash', 'abc123-0-test.jpg');
formData.append('fileName', 'test.jpg');

axios.post('http://127.0.0.1:3000/upload', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});
```

**响应示例**:

```json
{
  "code": 200,
  "message": "上传成功",
  "hash": "abc123-0-test.jpg",
  "filename": "abc123-0-test.jpg",
  "originalname": "test.jpg",
  "size": 1048576
}
```

**错误响应**:

```json
{
  "code": 400,
  "message": "没有选择文件"
}
```

---

### 2. 检查文件是否存在（秒传）

检查完整文件是否已存在，用于实现秒传功能。如果文件已存在，则无需上传，直接返回文件信息。

**接口地址**: `POST /check`

**请求方式**: `application/json`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hash | String | 是 | 文件哈希值（完整hash或fileHash） |
| fileName | String | 是 | 文件名 |

**请求示例**:

```javascript
axios.post('http://127.0.0.1:3000/check', {
  hash: 'abc123',
  fileName: 'test.jpg'
});
```

**响应示例（文件已存在）**:

```json
{
  "code": 200,
  "message": "文件已存在",
  "exists": true,
  "filePath": "uploads/merged/abc123-test.jpg",
  "fileName": "test.jpg",
  "size": 10485760,
  "hash": "abc123"
}
```

**响应示例（文件不存在）**:

```json
{
  "code": 200,
  "message": "文件不存在",
  "exists": false
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| exists | Boolean | 文件是否存在 |
| filePath | String | 文件完整路径（仅当 exists 为 true 时返回） |
| fileName | String | 文件名（仅当 exists 为 true 时返回） |
| size | Number | 文件大小，单位：字节（仅当 exists 为 true 时返回） |
| hash | String | 文件哈希值（仅当 exists 为 true 时返回） |

---

### 3. 验证分片（断点续传）

检查文件的分片上传状态，用于实现断点续传功能。

**接口地址**: `POST /verify`

**请求方式**: `application/json`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hash | String | 是 | 文件哈希值（完整hash或fileHash） |
| fileName | String | 是 | 文件名 |
| chunkCount | Number | 否 | 总分片数，用于判断是否全部上传完成 |

**请求示例**:

```javascript
axios.post('http://127.0.0.1:3000/verify', {
  hash: 'abc123',
  fileName: 'test.jpg',
  chunkCount: 10
});
```

**响应示例**:

```json
{
  "code": 200,
  "message": "验证成功",
  "uploadedChunks": [0, 1, 2, 5, 6],
  "shouldUpload": true,
  "isComplete": false
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| uploadedChunks | Array | 已上传的分片索引数组（已排序） |
| shouldUpload | Boolean | 是否需要继续上传 |
| isComplete | Boolean | 是否所有分片都已上传完成 |

**分片目录不存在时**:

```json
{
  "code": 200,
  "message": "分片目录不存在",
  "uploadedChunks": [],
  "shouldUpload": true
}
```

---

### 4. 合并分片

将所有分片合并为完整文件。

**接口地址**: `POST /merge`

**请求方式**: `application/json`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hash | String | 是 | 文件哈希值（完整hash或fileHash） |
| fileName | String | 是 | 文件名 |
| chunkCount | Number | 是 | 总分片数 |

**请求示例**:

```javascript
axios.post('http://127.0.0.1:3000/merge', {
  hash: 'abc123',
  fileName: 'test.jpg',
  chunkCount: 10
});
```

**响应示例**:

```json
{
  "code": 200,
  "message": "合并成功",
  "filePath": "uploads/merged/abc123-test.jpg",
  "fileName": "test.jpg",
  "size": 10485760,
  "hash": "abc123"
}
```

**错误响应**:

```json
{
  "code": 400,
  "message": "缺少必要参数：hash、fileName 和 chunkCount"
}
```

```json
{
  "code": 400,
  "message": "分片 3 不存在"
}
```

---

### 5. 查询上传进度

查询指定文件的上传进度。

**接口地址**: `GET /progress/:hash`

**请求方式**: `GET`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hash | String | 是 | 文件哈希值（完整hash或fileHash） |

**请求示例**:

```javascript
axios.get('http://127.0.0.1:3000/progress/abc123');
```

**响应示例**:

```json
{
  "code": 200,
  "uploadedCount": 7,
  "uploadedChunks": [0, 1, 2, 3, 4, 5, 6]
}
```

**分片目录不存在时**:

```json
{
  "code": 200,
  "uploadedCount": 0,
  "totalCount": 0,
  "progress": 0
}
```

---

## 使用流程

### 完整上传流程

1. **计算文件哈希**
   ```javascript
   // 前端：使用 SparkMD5 计算文件哈希
   const hash = await createHash(chunks);
   ```

2. **验证已上传分片**（断点续传）
   ```javascript
   const response = await axios.post('/verify', {
     hash: hash,
     fileName: fileName,
     chunkCount: chunks.length
   });
   
   const { uploadedChunks } = response.data;
   ```

3. **上传缺失的分片**
   ```javascript
   chunks.forEach((chunk, index) => {
     // 跳过已上传的分片
     if (uploadedChunks.includes(index)) {
       return;
     }
     
     const formData = new FormData();
     formData.append('chunk', chunk);
     formData.append('hash', `${hash}-${index}-${fileName}`);
     formData.append('fileName', fileName);
     
     axios.post('/upload', formData);
   });
   ```

4. **合并分片**
   ```javascript
   await axios.post('/merge', {
     hash: hash,
     fileName: fileName,
     chunkCount: chunks.length
   });
   ```

### 断点续传示例

```javascript
// 1. 计算文件哈希
const hash = await createHash(chunks);

// 2. 检查已上传的分片
const verifyRes = await axios.post('/verify', {
  hash: hash,
  fileName: file.name,
  chunkCount: chunks.length
});

const { uploadedChunks, isComplete } = verifyRes.data;

// 3. 如果已完成，直接合并
if (isComplete) {
  await axios.post('/merge', {
    hash: hash,
    fileName: file.name,
    chunkCount: chunks.length
  });
  return;
}

// 4. 只上传缺失的分片
const uploadPromises = chunks
  .map((chunk, index) => {
    if (uploadedChunks.includes(index)) {
      return Promise.resolve(); // 跳过已上传
    }
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('hash', `${hash}-${index}-${file.name}`);
    formData.append('fileName', file.name);
    
    return axios.post('/upload', formData);
  })
  .filter(Boolean);

await Promise.all(uploadPromises);

// 5. 合并所有分片
await axios.post('/merge', {
  hash: hash,
  fileName: file.name,
  chunkCount: chunks.length
});
```

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 500 | 服务器内部错误 |

## 注意事项

1. **分片命名规则**：分片的 hash 格式为 `{fileHash}-{index}-{fileName}`
   - `fileHash`: 文件的 MD5 哈希值
   - `index`: 分片索引（从 0 开始）
   - `fileName`: 原始文件名

2. **目录结构**：每个文件的分片存储在 `uploads/chunks/{fileHash}/` 目录下

3. **文件合并**：合并后的文件保存在 `uploads/merged/` 目录下

4. **并发上传**：支持多个分片并发上传，但建议控制并发数量

5. **错误处理**：上传失败的分片需要重新上传，已上传的分片不会重复上传

## 开发说明

### 项目结构

```
文件上传/
├── packages/
│   ├── server/          # 后端服务
│   │   └── server.js    # Express 服务器
│   └── file/            # 前端应用
│       ├── src/
│       │   ├── App.jsx  # React 主组件
│       │   └── main.jsx # 入口文件
│       └── index.html
├── uploads/             # 上传文件存储目录
└── package.json
```

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

## License

MIT
