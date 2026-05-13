/// PDF 输入数据
#[derive(Debug, Clone)]
pub struct PdfInput {
    /// 渲染后的 HTML 内容
    pub html_body: String,
    /// Markdown 源文件路径（用于解析相对路径图片）
    pub file_path: Option<String>,
}
