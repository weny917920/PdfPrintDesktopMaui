using System.Collections.Concurrent;

namespace MauiPdfPrinter.Platforms.Windows;

internal static class PdfFileActivation
{
	private static readonly ConcurrentQueue<string> PendingPaths = new();

	public static event Action<string>? FileActivated;

	public static void Publish(string path)
	{
		var handlers = FileActivated;
		if (handlers is null)
		{
			PendingPaths.Enqueue(path);
			return;
		}

		handlers(path);
	}

	public static bool TryTakePendingPath(out string path) => PendingPaths.TryDequeue(out path!);
}
