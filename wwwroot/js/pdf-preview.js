import * as pdfjs from "../pdfjs/build/pdf.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("../pdfjs/build/pdf.worker.js", import.meta.url).href;

const resourceOptions = {
    cMapUrl: new URL("../pdfjs/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("../pdfjs/standard_fonts/", import.meta.url).href,
    wasmUrl: new URL("../pdfjs/wasm/", import.meta.url).href,
    isEvalSupported: false
};

let activeDocument;
let activeLoadingTask;
let activePages = [];
let observer;
let zoom = 1;
let generation = 0;
let printMode = false;
let rootElement;
let resizeObserver;
let dotNetReference;
let afterPrintHandler;
let language = "en-US";
let lastVisiblePage = 0;
let scrollFrame = 0;
const renderTasks = new WeakMap();
const activeRenderTasks = new Set();
const pendingRenderPromises = new Set();

export function initialize(uiLanguage, callbackReference) {
    language = uiLanguage?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
    dotNetReference = callbackReference;
    document.documentElement.lang = language;
}

export async function load(streamReference) {
    const bytes = new Uint8Array(await streamReference.arrayBuffer());
    const candidateLoadingTask = pdfjs.getDocument({ ...resourceOptions, data: bytes });
    let candidate;
    try {
        candidate = await candidateLoadingTask.promise;
    } catch (error) {
        await candidateLoadingTask.destroy();
        throw error;
    }
    const root = document.getElementById("pdf-pages");

    if (!root) {
        await candidateLoadingTask.destroy();
        throw new Error("Preview panel is not available.");
    }

    const fragment = document.createDocumentFragment();
    const pages = [];

    try {
        for (let pageNumber = 1; pageNumber <= candidate.numPages; pageNumber++) {
            const page = await candidate.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const wrapper = document.createElement("article");
            const canvas = document.createElement("canvas");
            const caption = document.createElement("div");

            wrapper.className = "pdf-page";
            wrapper.dataset.pageNumber = String(pageNumber);
            wrapper.dataset.pageWidth = String(viewport.width);
            wrapper.dataset.pageHeight = String(viewport.height);
            wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
            wrapper.style.width = `${getDisplayWidth(wrapper, 1)}px`;
            canvas.className = "pdf-canvas";
            canvas.setAttribute("aria-label", `PDF page ${pageNumber}`);
            caption.className = "pdf-page-caption";
            caption.textContent = language === "zh-CN" ? `第 ${pageNumber} 页` : `Page ${pageNumber}`;
            wrapper.append(canvas, caption);
            fragment.append(wrapper);
            pages.push(wrapper);
            page.cleanup();
        }
    } catch (error) {
        await candidateLoadingTask.destroy();
        throw error;
    }

    disconnectObserver();
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    generation++;
    await cancelActiveRenders();
    const previousLoadingTask = activeLoadingTask;
    clearPrintRoot();
    activeLoadingTask = candidateLoadingTask;
    activeDocument = candidate;
    activePages = pages;
    rootElement = root;
    zoom = 1;
    printMode = false;
    root.replaceChildren(fragment);
    root.closest(".preview-scroll").scrollTop = 0;
    lastVisiblePage = 0;
    resizeObserver?.disconnect();
    const scrollContainer = document.querySelector(".preview-scroll");
    if (scrollContainer) {
        resizeObserver = new ResizeObserver(updatePageWidths);
        resizeObserver.observe(scrollContainer);
    }
    observePages();
    try {
        await renderPage(activePages[0], 1, generation);
    } catch (error) {
        showRenderError(error);
    }

    if (previousLoadingTask) {
        await previousLoadingTask.destroy();
    }

    return { pageCount: candidate.numPages };
}

function observePages() {
    if (!rootElement || !activePages.length) {
        return;
    }

    observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            const wrapper = entry.target;
            if (entry.isIntersecting) {
                renderPage(wrapper, 1, generation).catch(showRenderError);
            } else {
                clearPage(wrapper);
            }
        }
        updateVisiblePage();
    }, {
        root: document.querySelector(".preview-scroll"),
        rootMargin: "900px 0px"
    });

    for (const page of activePages) {
        observer.observe(page);
    }
}

function disconnectObserver() {
    observer?.disconnect();
    observer = undefined;
}

function getDisplayWidth(wrapper, zoomFactor = zoom) {
    const pageWidth = Number(wrapper.dataset.pageWidth);
    const fitWidth = Math.max(180, (rootElement?.clientWidth || pageWidth) - 36);
    return Math.min(pageWidth * zoomFactor, fitWidth * zoomFactor);
}

function renderPage(wrapper, renderScale, expectedGeneration) {
    if (!activeDocument || expectedGeneration !== generation) {
        return Promise.resolve(false);
    }
    if (wrapper.dataset.rendered === "true" && !printMode) {
        return Promise.resolve(true);
    }

    const existingTask = renderTasks.get(wrapper);
    if (existingTask) {
        return existingTask.then(rendered => {
            if (expectedGeneration !== generation) {
                return false;
            }
            if (!rendered || wrapper.dataset.rendered !== "true") {
                return renderPage(wrapper, renderScale, expectedGeneration);
            }
            return true;
        });
    }

    const task = renderPageCore(wrapper, renderScale, expectedGeneration);
    renderTasks.set(wrapper, task);
    pendingRenderPromises.add(task);
    return task.finally(() => {
        pendingRenderPromises.delete(task);
        if (renderTasks.get(wrapper) === task) {
            renderTasks.delete(wrapper);
        }
    });
}

async function cancelActiveRenders() {
    for (const task of activeRenderTasks) {
        task.cancel();
    }

    await Promise.allSettled([...pendingRenderPromises]);
}

function updateVisiblePage() {
    if (scrollFrame || !dotNetReference || !activePages.length) {
        return;
    }

    scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const scrollContainer = document.querySelector(".preview-scroll");
        if (!scrollContainer) {
            return;
        }

        const center = scrollContainer.getBoundingClientRect().top + scrollContainer.clientHeight / 2;
        let nearestPage = activePages[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const page of activePages) {
            const bounds = page.getBoundingClientRect();
            const distance = Math.abs((bounds.top + bounds.bottom) / 2 - center);
            if (distance < nearestDistance) {
                nearestPage = page;
                nearestDistance = distance;
            }
        }

        const pageNumber = Number(nearestPage.dataset.pageNumber);
        if (pageNumber !== lastVisiblePage) {
            lastVisiblePage = pageNumber;
            dotNetReference.invokeMethodAsync("OnVisiblePageChanged", pageNumber).catch(error => {
                console.error("Could not update the current PDF page indicator.", error);
            });
        }
    });
}

export function scrollToPage(pageNumber) {
    const page = activePages[Number(pageNumber) - 1];
    if (!page) {
        return;
    }

    page.scrollIntoView({ behavior: "smooth", block: "start" });
    updateVisiblePage();
}

function updatePageWidths() {
    if (printMode || !activePages.length) {
        return;
    }

    const resizedPages = activePages
        .map(page => ({ page, displayWidth: getDisplayWidth(page) }))
        .filter(({ page, displayWidth }) => Math.abs(page.clientWidth - displayWidth) > 1);

    if (!resizedPages.length) {
        return;
    }

    generation++;
    for (const { page, displayWidth } of resizedPages) {
        page.style.width = `${displayWidth}px`;
        delete page.dataset.rendered;
        if (isNearPreview(page)) {
            renderPage(page, 1, generation).catch(showRenderError);
        }
    }
}

function isNearPreview(wrapper) {
    const scrollContainer = document.querySelector(".preview-scroll");
    if (!scrollContainer) {
        return false;
    }

    const pageBounds = wrapper.getBoundingClientRect();
    const scrollBounds = scrollContainer.getBoundingClientRect();
    return pageBounds.bottom >= scrollBounds.top - 900 && pageBounds.top <= scrollBounds.bottom + 900;
}

async function renderPageCore(wrapper, renderScale, expectedGeneration) {
    if (expectedGeneration !== generation) {
        return false;
    }

    wrapper.dataset.rendering = "true";
    const canvas = wrapper.querySelector("canvas");
    const pageNumber = Number(wrapper.dataset.pageNumber);
    let page;

    try {
        page = await activeDocument.getPage(pageNumber);
        if (expectedGeneration !== generation) {
            return false;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = printMode
            ? baseViewport.width * renderScale
            : Math.max(120, Math.min(wrapper.clientWidth, baseViewport.width * zoom));
        const scale = printMode
            ? renderScale
            : availableWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const pixelRatio = printMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);

        canvas.width = Math.max(1, Math.ceil(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.ceil(viewport.height * pixelRatio));
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        const task = page.render({
            canvasContext: canvas.getContext("2d", { alpha: false }),
            viewport,
            transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
            background: "#ffffff"
        });
        activeRenderTasks.add(task);
        try {
            await task.promise;
        } finally {
            activeRenderTasks.delete(task);
        }
        if (expectedGeneration !== generation) {
            clearPage(wrapper);
            return false;
        } else {
            wrapper.dataset.rendered = "true";
            if (!printMode && !isNearPreview(wrapper)) {
                clearPage(wrapper);
            }
            return true;
        }
    } finally {
        page?.cleanup();
        delete wrapper.dataset.rendering;
    }
}

function clearPage(wrapper) {
    if (printMode || wrapper.dataset.rendering === "true") {
        return;
    }

    const canvas = wrapper.querySelector("canvas");
    if (canvas && wrapper.dataset.rendered === "true") {
        canvas.width = 0;
        canvas.height = 0;
        delete wrapper.dataset.rendered;
    }
}

function getPrintRoot() {
    let root = document.getElementById("print-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "print-root";
        document.body.append(root);
    }

    return root;
}

function clearPrintRoot() {
    const root = document.getElementById("print-root");
    if (!root) {
        return;
    }

    for (const image of root.querySelectorAll("img")) {
        URL.revokeObjectURL(image.src);
    }

    root.replaceChildren();
}

function showRenderError(error) {
    if (error?.name === "RenderingCancelledException") {
        return;
    }

    if (!rootElement) {
        return;
    }

    let errorElement = rootElement.querySelector(".render-error");
    if (!errorElement) {
        errorElement = document.createElement("div");
        errorElement.className = "render-error";
        errorElement.setAttribute("role", "alert");
        rootElement.prepend(errorElement);
    }

    errorElement.textContent = language === "zh-CN"
        ? `部分页面无法预览：${error.message || error}`
        : `Some pages could not be previewed: ${error.message || error}`;
}

export async function setZoom(value) {
    zoom = Math.max(0.5, Math.min(1.6, Number(value) || 1));
    generation++;
    disconnectObserver();

    for (const page of activePages) {
        page.style.width = `${getDisplayWidth(page)}px`;
        delete page.dataset.rendered;
    }

    observePages();
}

function parsePageSelection(ranges, pageCount) {
    if (!ranges) {
        return null;
    }

    const selected = new Set();
    for (const part of ranges.split(",")) {
        const [start, end = start] = part.split("-").map(Number);
        for (let page = Math.max(1, start); page <= Math.min(pageCount, end); page++) {
            selected.add(page);
        }
    }

    return selected;
}

const printQualities = {
    draft: { dpi: 100, jpeg: 0.8 },
    standard: { dpi: 150, jpeg: 0.92 },
    high: { dpi: 220, jpeg: 0.95 },
    best: { dpi: 300, jpeg: 0.97 },
    ultra: { dpi: 600, jpeg: 0.98 }
};

export async function preparePrint(monochrome = false, ranges = null, quality = "standard") {
    if (!activeDocument || !activePages.length) {
        throw new Error("There is no PDF open to print.");
    }

    const selection = parsePageSelection(ranges, activePages.length);
    const pageNumbers = activePages
        .map(page => Number(page.dataset.pageNumber))
        .filter(pageNumber => !selection || selection.has(pageNumber));
    if (!pageNumbers.length) {
        throw new Error("The selected page range contains no pages.");
    }

    finishPrint();
    document.documentElement.classList.toggle("print-mono", monochrome);
    const root = getPrintRoot();
    const { dpi, jpeg } = printQualities[quality] ?? printQualities.standard;
    const maximumPagePixelCount = 20_000_000;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    const document_ = activeDocument;
    let renderedPages = 0;
    let pageSize = null;

    try {
        for (const pageNumber of pageNumbers) {
            if (document_ !== activeDocument) {
                throw new Error("The document changed while preparing to print.");
            }

            const page = await document_.getPage(pageNumber);
            try {
                const baseViewport = page.getViewport({ scale: 1 });
                pageSize ??= { width: baseViewport.width / 72, height: baseViewport.height / 72 };
                const scale = Math.min(dpi / 72, Math.sqrt(maximumPagePixelCount / (baseViewport.width * baseViewport.height)));
                const viewport = page.getViewport({ scale });
                canvas.width = Math.max(1, Math.ceil(viewport.width));
                canvas.height = Math.max(1, Math.ceil(viewport.height));
                await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", jpeg));
                if (!blob) {
                    throw new Error(`Could not capture rendered page ${pageNumber} for printing.`);
                }

                const image = document.createElement("img");
                image.className = "pdf-print-image";
                image.alt = "";
                image.src = URL.createObjectURL(blob);
                await image.decode();
                const sheet = document.createElement("div");
                sheet.className = "print-sheet";
                sheet.append(image);
                root.append(sheet);
            } finally {
                page.cleanup();
            }

            renderedPages++;
            if (dotNetReference) {
                await dotNetReference.invokeMethodAsync("OnPrintProgress", renderedPages);
            }
        }
    } catch (error) {
        finishPrint();
        throw error;
    }

    canvas.width = 0;
    canvas.height = 0;
    afterPrintHandler = () => {
        finishPrint();
        dotNetReference?.invokeMethodAsync("OnPrintDialogClosed").catch(error => {
            console.error("Could not notify the app that the print dialog closed.", error);
        });
    };
    window.addEventListener("afterprint", afterPrintHandler, { once: true });
    return pageSize;
}

export function finishPrint() {
    if (afterPrintHandler) {
        window.removeEventListener("afterprint", afterPrintHandler);
        afterPrintHandler = undefined;
    }

    document.documentElement.classList.remove("print-mono");
    clearPrintRoot();
}

export async function dispose() {
    disconnectObserver();
    resizeObserver?.disconnect();
    generation++;
    await cancelActiveRenders();
    if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
    }
    dotNetReference = undefined;
    if (activeLoadingTask) {
        await activeLoadingTask.destroy();
        activeLoadingTask = undefined;
        activeDocument = undefined;
    }
    clearPrintRoot();
    activePages = [];
    rootElement?.replaceChildren();
}
