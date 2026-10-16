using System.Globalization;
using Microsoft.Windows.AppLifecycle;
using Microsoft.UI.Xaml;
using MauiPdfPrinter.Platforms.Windows;
using Windows.ApplicationModel.Activation;
using Windows.Storage;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MauiPdfPrinter.WinUI;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : MauiWinUIApplication
{
	/// <summary>
	/// Initializes the singleton application object.  This is the first line of authored code
	/// executed, and as such is the logical equivalent of main() or WinMain().
	/// </summary>
	public App()
	{
		ConfigureWebView2Language();
		var currentInstance = AppInstance.GetCurrent();
		var activationArgs = currentInstance.GetActivatedEventArgs();
		var appInstance = AppInstance.FindOrRegisterForKey("YWen.PDFPrintDesktop");
		if (!appInstance.IsCurrent)
		{
			appInstance.RedirectActivationToAsync(activationArgs).AsTask().GetAwaiter().GetResult();
			Environment.Exit(0);
			return;
		}

		appInstance.Activated += OnAppInstanceActivated;
		HandleActivation(activationArgs);
		this.InitializeComponent();
	}

	private static void OnAppInstanceActivated(object? sender, AppActivationArguments eventArgs)
	{
		HandleActivation(eventArgs);
	}

	private static void HandleActivation(AppActivationArguments? activationArgs)
	{
		if (activationArgs?.Kind != ExtendedActivationKind.File ||
			activationArgs.Data is not FileActivatedEventArgs fileArgs)
		{
			return;
		}

		foreach (var file in fileArgs.Files.OfType<StorageFile>())
		{
			PdfFileActivation.Publish(file.Path);
		}
	}

	private static void ConfigureWebView2Language()
	{
		var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("zh", StringComparison.OrdinalIgnoreCase)
			? "zh-CN"
			: "en-US";
		var existingArguments = Environment.GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
		var arguments = string.IsNullOrWhiteSpace(existingArguments)
			? $"--lang={language}"
			: $"{existingArguments.Trim()} --lang={language}";

		Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", arguments);
	}

	protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
