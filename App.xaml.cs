namespace MauiPdfPrinter;

public partial class App : Application
{
	private readonly MainPage _mainPage;

	public App(MainPage mainPage)
	{
		_mainPage = mainPage;
		InitializeComponent();
	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		var window = new Window(_mainPage) { Title = "PDF Print" };
		window.TitleBar = new TitleBar { Title = "PDF Print", Icon = ImageSource.FromFile("titleicon.png") };
#if WINDOWS
		window.Created += (_, _) =>
		{
			window.Dispatcher.Dispatch(() =>
			{
				if (window.Handler?.PlatformView is Microsoft.UI.Xaml.Window nativeWindow &&
					nativeWindow.AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter presenter)
				{
					presenter.Maximize();
				}

				var iconPath = Path.Combine(AppContext.BaseDirectory, "app.ico");
				if (File.Exists(iconPath) && window.Handler?.PlatformView is Microsoft.UI.Xaml.Window iconWindow)
				{
					SetWindowIcon(iconWindow, iconPath);
				}
			});
		};
#endif
		return window;
	}

#if WINDOWS
	[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)]
	private static extern IntPtr LoadImage(IntPtr hInst, string name, uint type, int cx, int cy, uint flags);

	[System.Runtime.InteropServices.DllImport("user32.dll")]
	private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

	private static void SetWindowIcon(Microsoft.UI.Xaml.Window nativeWindow, string iconPath)
	{
		try
		{
			nativeWindow.AppWindow.SetIcon(iconPath);
		}
		catch
		{
		}

		var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(nativeWindow);
		const uint imageIcon = 1, loadFromFile = 0x10, wmSetIcon = 0x80;
		var small = LoadImage(IntPtr.Zero, iconPath, imageIcon, 16, 16, loadFromFile);
		var big = LoadImage(IntPtr.Zero, iconPath, imageIcon, 32, 32, loadFromFile);
		if (small != IntPtr.Zero) SendMessage(hwnd, wmSetIcon, IntPtr.Zero, small);
		if (big != IntPtr.Zero) SendMessage(hwnd, wmSetIcon, (IntPtr)1, big);
	}
#endif
}
