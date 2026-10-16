using System.Globalization;
using Microsoft.AspNetCore.Components.WebView;
using MauiPdfPrinter.Services;
using Microsoft.Web.WebView2.Core;

namespace MauiPdfPrinter;

public partial class MainPage : ContentPage
{
	public MainPage()
	{
		InitializeComponent();
	}

	private static void OnBlazorWebViewInitializing(object? sender, BlazorWebViewInitializingEventArgs eventArgs)
	{
		eventArgs.EnvironmentOptions ??= new CoreWebView2EnvironmentOptions();
		eventArgs.EnvironmentOptions.Language =
			CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("zh", StringComparison.OrdinalIgnoreCase)
				? "zh-CN"
				: "en-US";
	}

	public Task PrintAsync(PrintRequest request)
	{
		return MainThread.InvokeOnMainThreadAsync(async () =>
		{
			if (blazorWebView.Handler?.PlatformView is not Microsoft.UI.Xaml.Controls.WebView2 webView ||
				webView.CoreWebView2 is not { } coreWebView)
			{
				throw new InvalidOperationException("The Windows print view is not ready yet. Please try again.");
			}

			var settings = coreWebView.Environment.CreatePrintSettings();
			settings.PrinterName = request.PrinterName;
			settings.Copies = request.Copies;
			settings.Duplex = request.Duplex switch
			{
				DuplexMode.LongEdge => CoreWebView2PrintDuplex.TwoSidedLongEdge,
				DuplexMode.ShortEdge => CoreWebView2PrintDuplex.TwoSidedShortEdge,
				_ => CoreWebView2PrintDuplex.OneSided
			};
			settings.ColorMode = request.Color ? CoreWebView2PrintColorMode.Color : CoreWebView2PrintColorMode.Grayscale;
			settings.ShouldPrintBackgrounds = true;
			settings.MarginTop = settings.MarginBottom = settings.MarginLeft = settings.MarginRight = 0;
			settings.ShouldPrintHeaderAndFooter = false;

			ApplyPaperSize(settings, request, request.PaperWidthInches, request.PaperHeightInches);
			var status = await coreWebView.PrintAsync(settings);
			if (status == CoreWebView2PrintStatus.PrinterUnavailable &&
				request.PrinterName.Contains("PDF", StringComparison.OrdinalIgnoreCase))
			{
				await SavePdfAsync(coreWebView, settings, request);
				return;
			}

			if (status != CoreWebView2PrintStatus.Succeeded)
			{
				throw new InvalidOperationException(status == CoreWebView2PrintStatus.PrinterUnavailable
					? "The printer is unavailable. Make sure it is online and not a virtual printer that asks for an output file."
					: $"Printing failed: {status}");
			}
		});
	}

	private static void ApplyPaperSize(CoreWebView2PrintSettings settings, PrintRequest request, double? paperWidth, double? paperHeight)
	{
		if (paperWidth is not > 0 || paperHeight is not > 0)
		{
			return;
		}

		var short_ = Math.Min(paperWidth.Value, paperHeight.Value);
		var long_ = Math.Max(paperWidth.Value, paperHeight.Value);
		// Orient the paper to follow the first PDF page so content fills the sheet.
		var landscape = request.PageWidthInches > request.PageHeightInches;
		settings.Orientation = landscape ? CoreWebView2PrintOrientation.Landscape : CoreWebView2PrintOrientation.Portrait;
		settings.PageWidth = short_;
		settings.PageHeight = long_;
	}

	// Virtual PDF printers need an output file, which direct printing cannot supply.
	private static async Task SavePdfAsync(CoreWebView2 coreWebView, CoreWebView2PrintSettings settings, PrintRequest request)
	{
		var picker = new Windows.Storage.Pickers.FileSavePicker
		{
			SuggestedFileName = "Print",
			SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary
		};
		picker.FileTypeChoices.Add("PDF", [".pdf"]);
		var window = Application.Current?.Windows.FirstOrDefault()?.Handler?.PlatformView as Microsoft.Maui.MauiWinUIWindow;
		if (window is null)
		{
			throw new InvalidOperationException("The application window is not available.");
		}

		WinRT.Interop.InitializeWithWindow.Initialize(picker, window.WindowHandle);
		var file = await picker.PickSaveFileAsync();
		if (file is null)
		{
			return;
		}

		settings.PrinterName = string.Empty;
		// Without an explicit paper size, match the PDF page so the file is not padded to the default Letter paper.
		ApplyPaperSize(settings, request, request.PaperWidthInches ?? request.PageWidthInches, request.PaperHeightInches ?? request.PageHeightInches);
		settings.ScaleFactor = 1;
		var saved = await coreWebView.PrintToPdfAsync(file.Path, settings);
		if (!saved)
		{
			throw new InvalidOperationException("Saving the PDF failed.");
		}
	}
}
