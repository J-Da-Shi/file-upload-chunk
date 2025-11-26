import React, { useState } from 'react'
import { Upload, Button, Progress, message } from 'antd';
import SparkMD5 from 'spark-md5';
import axios from 'axios';

const App = () => {

  const [percent, setPercent] = useState(0);

  const props = {
    name: 'file',
    // action: 'http://127.0.0.1:3000/upload',
    // headers: {
    //   authorization: 'authorization-text',
    // },
    onChange(info) {
      if (info.file.status !== 'uploading') {
        console.log(info.file, info.fileList);
      }
      if (info.file.status === 'done') {
        message.success(`${info.file.name} file uploaded successfully`);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} file upload failed.`);
      }
    },
    beforeUpload: async (file) => {
      // 分片
      const chunks = createChunks(file);
      try {
        // 计算hash（唯一值，为后续断点续传、合并文件做准备）
        const hash = await createHash(chunks);
        upload(chunks, hash, file.name);
      } catch (error) {
        message.error('文件哈希计算失败');
        console.error(error);
      }
      return false; // 阻止自动上传
    },
    // onProgress(progress) {
    //   setPercent(progress.percent);
    // },
    // onError(error) {
    //   message.error(`${error.file.name} file upload failed.`);
    // },
    // onSuccess(response) {
    //   message.success(`${response.file.name} file uploaded successfully`);
    // },
  };

  const createChunks = (file) => {
    const chunks = [];
    for (let i = 0; i < file.size; i += 1024 * 1024) {
      chunks.push(file.slice(i, i + 1024 * 1024));
    }
    return chunks;
  }

  const createHash = async (chunks) => {
    const spark = new SparkMD5.ArrayBuffer();
    setPercent(0);
    for (let i = 0; i < chunks.length; i++) {
      const buffer = await new Promise((resolve, reject) => {
        // 读取文件的实例
        const reader = new FileReader();
        // 读取文件后，自动触发onload
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`读取分片 ${i} 失败`));
        // 读取文件
        reader.readAsArrayBuffer(chunks[i]);
      });

      setPercent(Math.round(((i + 1) / chunks.length) * 70));
      // 将读取的文件添加到spark中
      spark.append(buffer);
    }

    return spark.end();
  }

  /*
* params: 分片数组，分片后的hash数组，文件名称
*
*/
  const upload = (chunks, hash, fileName) => {
    // 通过promise.all进行上传，如果全部成功会有返回
    // 创建一个数组，存储每个上传任务
    const taskArr = [];
    let uploadedCount = 0;
    
    chunks.forEach((chunk, index) => {
      // 暂时我这里使用formData对象进行上传
      // 后续根据后端要求进行更改
      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('hash', `${hash}-${index}-${fileName}`);
      formData.append('fileName', fileName);
      const task = axios.post('http://127.0.0.1:3000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const chunkPercent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // 计算总体进度：30% (哈希计算) + 70% (上传进度)
          const totalPercent = 30 + Math.round((uploadedCount * 100 + chunkPercent) / chunks.length * 0.7);
          setPercent(totalPercent);
        }
      }).then(() => {
        uploadedCount++;
        // 更新进度
        const totalPercent = 30 + Math.round((uploadedCount / chunks.length) * 70);
        setPercent(totalPercent);
      });
      taskArr.push(task);
    })

    Promise.all(taskArr).then(res => {
      console.log('所有分片上传成功', res);
      setPercent(100);
      mergeChunks(hash, fileName, chunks);
    }).catch(err => {
      console.error('上传失败', err);
      message.error('文件上传失败，请重试');
    })
  }

  const mergeChunks = (hash, fileName, chunks) => {
    console.log('开始合并分片:', { hash, fileName, chunkCount: chunks.length });
    
    axios.post('http://127.0.0.1:3000/merge', {
      hash,
      fileName,
      chunkCount: chunks.length
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(res => {
      console.log('合并成功', res);
      message.success('文件上传并合并成功！');
    }).catch(err => {
      console.error('合并失败', err);
      const errorMsg = err.response?.data?.message || err.message || '合并失败';
      message.error(`文件合并失败: ${errorMsg}`);
      
      // 如果是分片目录不存在的错误，提示用户重新上传
      if (err.response?.data?.message?.includes('分片目录不存在')) {
        message.warning('分片目录不存在，请重新上传文件');
      }
    })
  }

  return <div>
    <Upload  {...props}>
      <Button type="primary">上传文件</Button>
    </Upload>
    <Progress style={{ width: 200 }} percent={percent} />
    <Button>暂停</Button>
    <Button>取消</Button>
  </div>
}

export default App;
