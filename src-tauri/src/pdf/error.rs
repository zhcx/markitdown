use thiserror::Error;

/// PDF 导出错误类型
#[derive(Debug, Error)]
pub enum PdfError {
    #[error("Chrome 初始化失败: {0}")]
    ChromeInit(String),

    #[error("页面导航失败: {0}")]
    Navigation(String),

    #[error("PDF 生成失败: {0}")]
    Generation(String),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}

pub type PdfResult<T> = Result<T, PdfError>;
