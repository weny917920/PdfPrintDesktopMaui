namespace MauiPdfPrinter.Services;

public sealed record PrinterInfo(string Name, bool IsDefault, bool SupportsDuplex);

public enum DuplexMode
{
	Simplex,
	LongEdge,
	ShortEdge
}

public sealed record PrintRequest(string PrinterName, int Copies, DuplexMode Duplex, string? PageRanges = null, bool Color = true, double? PageWidthInches = null, double? PageHeightInches = null, double? PaperWidthInches = null, double? PaperHeightInches = null);

public interface IPrintService
{
	IReadOnlyList<PrinterInfo> GetPrinters();

	Task PrintAsync(PrintRequest request, CancellationToken cancellationToken = default);
}