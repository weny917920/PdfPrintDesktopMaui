using System.Runtime.InteropServices;
using MauiPdfPrinter.Services;

namespace MauiPdfPrinter.Platforms.Windows;

public sealed class WindowsPrintService(MainPage mainPage) : IPrintService
{
	public IReadOnlyList<PrinterInfo> GetPrinters()
	{
		var defaultName = GetDefaultPrinterName();
		var printers = new List<PrinterInfo>();
		const int flags = 0x2 | 0x4; // PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
		EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out var needed, out _);
		if (needed == 0)
		{
			return printers;
		}

		var buffer = Marshal.AllocHGlobal(needed);
		try
		{
			if (!EnumPrinters(flags, null, 4, buffer, needed, out _, out var count))
			{
				return printers;
			}

			var size = Marshal.SizeOf<PrinterInfo4>();
			for (var index = 0; index < count; index++)
			{
				var info = Marshal.PtrToStructure<PrinterInfo4>(buffer + index * size);
				if (string.IsNullOrEmpty(info.PrinterName))
				{
					continue;
				}

				var duplex = DeviceCapabilities(info.PrinterName, null, 7, IntPtr.Zero, IntPtr.Zero) == 1;
				printers.Add(new PrinterInfo(info.PrinterName, string.Equals(info.PrinterName, defaultName, StringComparison.OrdinalIgnoreCase), duplex));
			}
		}
		finally
		{
			Marshal.FreeHGlobal(buffer);
		}

		return printers;
	}

	public Task PrintAsync(PrintRequest request, CancellationToken cancellationToken = default)
	{
		cancellationToken.ThrowIfCancellationRequested();
		var printer = GetPrinters().FirstOrDefault(p => p.Name == request.PrinterName)
			?? throw new InvalidOperationException("The selected printer is no longer available.");
		if (request.Duplex != DuplexMode.Simplex && !printer.SupportsDuplex)
		{
			throw new InvalidOperationException("The selected printer does not support duplex printing.");
		}

		return mainPage.PrintAsync(request);
	}

	private static string? GetDefaultPrinterName()
	{
		var length = 0;
		GetDefaultPrinter(null, ref length);
		if (length <= 0)
		{
			return null;
		}

		var name = new System.Text.StringBuilder(length);
		return GetDefaultPrinter(name, ref length) ? name.ToString() : null;
	}

	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	private struct PrinterInfo4
	{
		public string PrinterName;
		public string ServerName;
		public uint Attributes;
	}

	[DllImport("winspool.drv", EntryPoint = "EnumPrintersW", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool EnumPrinters(int flags, string? name, int level, IntPtr printerEnum, int size, out int needed, out int returned);

	[DllImport("winspool.drv", EntryPoint = "GetDefaultPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool GetDefaultPrinter(System.Text.StringBuilder? buffer, ref int size);

	[DllImport("winspool.drv", EntryPoint = "DeviceCapabilitiesW", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern int DeviceCapabilities(string device, string? port, short capability, IntPtr output, IntPtr devMode);
}