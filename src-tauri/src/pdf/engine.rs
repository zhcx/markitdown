use super::PdfExportOptions;
use super::error::PdfResult;

/// PDF 引擎抽象 trait
pub trait PdfEngine: Send + Sync {
    fn generate(&self, input: PdfInput, options: &PdfExportOptions) -> PdfResult<Vec<u8>>;
}

/// PDF 输入数据
#[derive(Debug, Clone)]
pub struct PdfInput {
    /// 渲染后的 HTML 内容
    pub html_body: String,
    /// Markdown 源文件路径（用于解析相对路径图片）
    pub file_path: Option<String>,
}