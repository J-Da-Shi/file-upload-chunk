import React, { useState, useRef } from 'react'
import { Upload, Button, Progress, message } from 'antd';
import SparkMD5 from 'spark-md5';
import axios from 'axios';

const App = () => {

  const [percent, setPercent] = useState(0);
  const [uploadFile, setUploadFile] = useState(null);
  const stopRef = useRef(null);
  // 在组件顶层添加
  const isCancelledRef = useRef(false);
  const fileInfoRef = useRef(null); // 保存文件信息：hash, chunks, fileName

  const props = {
    name: 'file',
    // action: 'http://127.0.0.1:3000/upload',
    // headers: {
    //   authorization: 'authorization-text',
    // },
    onChange(info) {
      if (info.file.status !== 'uploading') {
        console.log(info.file, info.fileList, '111');
      }
      if (info.file.status === 'done') {
        message.success(`${info.file.name} file uploaded successfully`);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} file upload failed.`);
      }
    },
    beforeUpload: async (file) => {
      setUploadFile(file)
      handleUpload(file)
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

  const handleUpload = async (file, isResume = false) => {

    isCancelledRef.current = false; // 重置取消标志
    // 分片
    // const chunks = createChunks(file);
    let chunks, hash;

    if (isResume && fileInfoRef.current) {
      chunks = fileInfoRef.current.chunks;
      hash = fileInfoRef.current.hash;
      console.log('继续上传，使用已保存的 hash:', hash);
    } else {
      chunks = createChunks(file);
      try {
        // 计算hash（唯一值，为后续断点续传、合并文件做准备）
        hash = await createHash(chunks, isCancelledRef);
        if (isCancelledRef.current) {
          console.log('Hash 计算被取消');
          return;
        }
        // 保存文件信息
        fileInfoRef.current = { chunks, hash, fileName: file.name };
      } catch (error) {
        if (error.message === 'Hash calculation cancelled') {
          message.error('Hash 计算被用户取消');
          return;
        }
        message.error('文件哈希计算失败');
        console.error(error);
      }
    }

    await upload(chunks, hash, file.name);
  }

  const createChunks = (file) => {
    const chunks = [];
    for (let i = 0; i < file.size; i += 1024 * 1024) {
      chunks.push(file.slice(i, i + 1024 * 1024));
    }
    return chunks;
  }

  const createHash = async (chunks, cancelRef) => {
    const spark = new SparkMD5.ArrayBuffer();
    setPercent(0);
    for (let i = 0; i < chunks.length; i++) {
      // 检查是否被取消
      if (cancelRef.current) {
        throw new Error('Hash calculation cancelled');
      }
      const buffer = await new Promise((resolve, reject) => {
        // 检查是否被取消（在读取前）
        if (cancelRef.current) {
          reject(new Error('Hash calculation cancelled'));
          return;
        }
        // 读取文件的实例
        const reader = new FileReader();
        // 读取文件后，自动触发onload
        reader.onload = () => {
          // 检查是否在读取过程中被取消
          if (cancelRef.current) {
            reject(new Error('Hash calculation cancelled'));
          } else {
            resolve(reader.result);
          }
        };
        reader.onerror = () => reject(new Error(`读取分片 ${i} 失败`));
        // 读取文件
        reader.readAsArrayBuffer(chunks[i]);
      });

      // 再次检查（读取完成后）
      if (cancelRef.current) {
        throw new Error('Hash calculation cancelled');
      }

      setPercent(Math.round(((i + 1) / chunks.length) * 30));
      // 将读取的文件添加到spark中
      spark.append(buffer);
    }

    return spark.end();
  }

  /*
* params: 分片数组，分片后的hash数组，文件名称
*
*/
  const upload = async (chunks, hash, fileName) => {
    // 先检查已上传的分片
    const verifyRes = await axios.post('http://127.0.0.1:3000/verify', {
      hash,
      fileName,
      chunkCount: chunks.length
    });
    
    const { uploadedChunks = [], isComplete } = verifyRes.data;
    
    // 如果已完成，直接合并
    if (isComplete) {
      setPercent(100);
      mergeChunks(hash, fileName, chunks);
      return;
    }

    // 计算已上传的进度（hash 计算占 30%，已上传分片占 70%）
    const hashProgress = 30;
    const uploadedProgress = (uploadedChunks.length / chunks.length) * 70;
    setPercent(Math.round(hashProgress + uploadedProgress));
    
    // 只上传缺失的分片
    const taskArr = [];
    let uploadedCount = uploadedChunks.length;

    const CancelToken = axios.CancelToken;
    const source = CancelToken.source();
    stopRef.current = source

    chunks.forEach((chunk, index) => {
      // 跳过已上传的分片
      if (uploadedChunks.includes(index)) {
        return;
      }
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
        cancelToken: source.token,
        onUploadProgress: (progressEvent) => {
          const chunkPercent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // 计算总体进度：30% (哈希) + 已上传分片的进度 + 当前分片进度
          const currentChunkProgress = (chunkPercent / chunks.length) * 0.7;
          const totalPercent = 30 + (uploadedCount / chunks.length) * 70 + currentChunkProgress;
          setPercent(Math.round(totalPercent));
        }
      }).then((response) => {
        uploadedCount++;
        const totalPercent = 30 + Math.round((uploadedCount / chunks.length) * 70);
        setPercent(totalPercent);
        return response;
      });
      taskArr.push(task);
    })

    if (taskArr.length === 0) {
      // 所有分片都已上传，直接合并
      setPercent(100);
      mergeChunks(hash, fileName, chunks);
      return;
    }

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

  const handleStop = () => {
    // 设置取消标志
    isCancelledRef.current = true;

    // 取消上传请求
    if (stopRef.current) {
      console.log('取消上传');
      stopRef.current.cancel('Operation canceled by the user.');
      stopRef.current = null;
    }

    if (stopRef.current) {
      console.log('取消上传');
      stopRef.current.cancel('Operation canceled by the user.');
      stopRef.current = null; // 取消后清空
    } else if (stopRef.current) {
      console.log('没有正在进行的上传任务');
      message.warning('没有正在进行的上传任务');
    }
  }

  return <div>
    <Upload  {...props}>
      <Button type="primary">上传文件</Button>
    </Upload>
    <Progress style={{ width: 200 }} percent={percent} />
    <Button onClick={handleStop}>暂停</Button>
    <Button onClick={() => handleUpload(uploadFile, true)}>继续</Button>
    <Button>取消</Button>
  </div>
}

export default App;
