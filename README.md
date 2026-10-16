# PDF Print

A Windows-first PDF viewer and printer built with .NET MAUI Blazor Hybrid. Choose a PDF, preview its pages in the app, then use the Windows print settings page to select a printer, copy count, paper size, and supported simplex/duplex mode.

PDF rendering uses a locally bundled PDF.js distribution, so viewing does not depend on a third-party service or send document contents over the network. The app does not print until the user selects **打印**.

## Requirements

- Windows 10 version 1809 (build 17763) or later.
- .NET 10 SDK and the .NET MAUI Windows workload.
- Visual Studio 2022 with the Windows App SDK / Windows 10 SDK components, or equivalent Windows build tools.
- Microsoft Edge WebView2 Runtime (normally preinstalled on current Windows 10/11 devices).

Printing opens the full WebView2 print preview so the preview pane and all browser print settings remain available. The app brings that separate print window to the foreground, resizes it to fit the display work area, and keeps it above the app window. Available paper sizes, copy count, print quality, and simplex/duplex choices are supplied by the selected printer driver. The app reads the selected PDF and renders pages in memory; it does not create an output file itself. A virtual printer such as Microsoft Print to PDF can create a file when selected.

## Build and run

From this folder:

```powershell
dotnet restore
dotnet build -f net10.0-windows10.0.19041.0
dotnet run -f net10.0-windows10.0.19041.0
```

Create a framework-dependent Windows x64 publish output:

```powershell
dotnet publish -c Release -f net10.0-windows10.0.19041.0 -r win-x64 --self-contained false
```

The publish output is under `bin\Release\net10.0-windows10.0.19041.0\win-x64\publish`.

## Microsoft Store and opening PDF files from Explorer

The Windows package declares `.pdf` as a supported file type. When Windows activates the app for a PDF, the app opens that file directly in the preview. Windows controls the default-app choice: installing this app does **not** silently replace the user's existing PDF association. Users can choose **Open with** or select PDF Print under **Settings > Apps > Default apps > Choose defaults by file type**.

To produce a Windows Store MSIX package locally:

```powershell
dotnet publish -c Release -f net10.0-windows10.0.19041.0 -r win-x64 -p:WindowsPackageType=MSIX
```

The generated package is under `bin\Release\net10.0-windows10.0.19041.0\win-x64\AppPackages`. Store packages are unsigned locally; Microsoft Store signs the package after certification. To install a package locally for testing, package it with signing enabled and trust its development certificate, or use the Store's private flighting workflow.

### First-time submission checklist

1. Enroll in the [Microsoft Partner Center](https://partner.microsoft.com/dashboard) Windows developer program and create a new app reservation. Complete the account verification steps shown by Partner Center.
2. Copy the **exact package identity name and publisher** provided by Partner Center into `ApplicationId` in `MauiPdfPrinter.csproj` and the `Identity`/`PublisherDisplayName` values in `Platforms\Windows\Package.appxmanifest`. The current project values are development placeholders; do not submit a package until they match Partner Center. Increase `ApplicationVersion` for each Store update.
3. Build and upload the MSIX package from the output directory, then complete the Store listing, age-rating questionnaire, required declarations, screenshots, and submission review in Partner Center.
4. After Store approval, users install the app from its Store listing. They can then choose it as their default PDF app in Windows; the app cannot force that system-wide choice.

The account owner must complete Partner Center enrollment, reserve the product name, provide listing content/screenshots, and submit the package. These account-specific steps cannot be completed from this project folder.

## Use

1. Open a `.pdf` file (up to 128 MB) with **打开 PDF**, or set PDF Print Desktop as the Windows default for `.pdf` and open the file from Explorer.
2. Open another PDF at any time to replace the current document. Review pages by scrolling or using the page arrows; use the zoom controls as needed.
3. Choose **打印** to open the in-window print settings panel next to the preview (single window, no separate dialog). Select the printer, copies, and one-/two-sided printing (duplex options appear only when the selected printer reports duplex support), then press **打印** to send the job directly through WebView2 PrintAsync with those settings. The app reuses rendered preview canvases when their resolution is sufficient and waits only for any in-progress page needed for printing, rather than waiting globally for all preview renders. Pages that are not already rendered are rasterized at up to 1.25 times native CSS resolution, with a 2-megapixel cap for unusually large source pages; progress is reported after each page. It keeps the full original PDF page raster, including its original margins, without cropping or changing the page layout. Print CSS leaves paper size to the selected printer and fits each complete page to that sheet while preserving its aspect ratio, so one source page still maps to one printed sheet.

The WebView2 print settings are provided by Edge and the selected printer driver; paper size, layout, copies, duplex, and quality availability vary by printer driver. The app starts maximized and explicitly raises the separate print-preview window to the foreground.

Invalid or damaged PDFs produce an in-app error. If Windows has no installed printer, add one in Windows Settings before printing.
The interface follows the Windows display language, showing Chinese for Chinese Windows languages and English otherwise.

## Regression checks

- With the app closed, open a PDF from Explorer using PDF Print Desktop and confirm the document appears.
- With the app already open, open a PDF from Explorer and confirm the activated app displays the selected file.
- Print a multi-page PDF containing text, images, and mixed page sizes; verify each source page maps to one print-preview page and there are no inserted blank pages. In the printer settings page, verify paper size, copy count, and duplex options match the selected printer driver.
- Print to a physical printer and to Microsoft Print to PDF; verify the print settings page opens and completes each job.

## PDF.js

The preview runtime in `wwwroot\pdfjs` is PDF.js 6.4.299, distributed under the Apache License 2.0. Its license is included at `wwwroot\pdfjs\LICENSE`.
