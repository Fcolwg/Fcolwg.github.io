(function () {
  const APP_VERSION = "0.6.10-bo-friendly-3d";
  const xDomain = { min: 0, max: 10 };
  const xCandidateStep = 0.1;
  const xCandidateIntervals = Math.round((xDomain.max - xDomain.min) / xCandidateStep);

  const formulaTemplates = {
    1: "0.40 + 0.10*sin(1.3*x) + 0.06*sin(2.7*x + 0.4) + 0.45*exp(-pow((x - 1.6)/0.75, 2)) + 0.35*exp(-pow((x - 6.8)/0.95, 2)) + 0.82*exp(-pow((x - 4.2)/0.55, 2)) + 0.26*exp(-pow((x - 8.8)/0.70, 2))",
    2: "0.40 + 0.08*sin(0.8*x + 3*y) + 0.06*cos(1.2*x - 4*y) + 1.12*exp(-pow((x - 4.6)/1.35, 2) - pow((y - 0.62)/0.20, 2)) + 0.58*exp(-pow((x - 8.1)/1.45, 2) - pow((y - 0.20)/0.23, 2)) + 0.42*exp(-pow((x - 1.6)/1.25, 2) - pow((y - 0.82)/0.22, 2)) - 0.28*exp(-pow((x - 6.4)/0.95, 2) - pow((y - 0.76)/0.16, 2))",
    3: "0.40 + 0.08*sin(0.7*x + 3*y + 2*z) + 0.06*cos(1.1*x - 4*z) + 1.22*exp(-pow((x - 7.35)/1.25, 2) - pow((y - 0.36)/0.22, 2) - pow((z - 0.62)/0.22, 2)) + 0.72*exp(-pow((x - 4.5)/1.45, 2) - pow((y - 0.64)/0.25, 2) - pow((z - 0.48)/0.24, 2)) + 0.42*exp(-pow((x - 1.4)/1.30, 2) - pow((y - 0.28)/0.22, 2) - pow((z - 0.26)/0.22, 2)) - 0.22*exp(-pow((x - 6.0)/1.05, 2) - pow((y - 0.82)/0.16, 2) - pow((z - 0.72)/0.18, 2))",
  };

  const plotNotes = {
    1: "선=평가 대상 함수 f(x)<br>파란 점=BO 평가점, 회색 x=sampling 평가점, 주황 마름모=다음 BO 후보",
    2: "색=평가 대상 함수 f(x,y) 값(노랑일수록 높음)<br>점=실제 평가 위치, 주황 마름모=다음 BO 후보",
    3: "면/색=z=0.5 단면 참고 지도<br>점 높이=각 점의 실제 z에서 계산한 f 값",
  };

  const acquisitionDescriptions = {
    ei: "EI 획득함수는 현재 best보다 좋아질 가능성과 좋아질 때의 크기를 함께 봅니다.",
    pi: "PI 획득함수는 현재 best를 넘을 확률을 크게 보는 방식입니다.",
    ucb: "UCB 획득함수는 평균과 불확실성을 조합해 exploration과 exploitation을 조절합니다.",
    custom: "사용자 정의 획득함수는 mu, sigma, best 같은 변수를 조합해 다음 후보 선택 점수를 만듭니다.",
  };

  let appTrace = [];
  let appCursor = 0;
  let appPlayTimer = null;
  let plotlyUpgradeTimer = null;
  let plotlyUpgradeDone = false;
  let plotZoom = 1;
  let drawnValues = [];
  let drawCanvasContext = null;

  function boot() {
    document.querySelectorAll("[data-app-version]").forEach((node) => {
      node.textContent = `Version ${APP_VERSION}`;
    });

    const page = document.body.dataset.page;
    if (page === "app") initAppPage();
  }

  function initAppPage() {
    const dimension = document.querySelector("#dimension");
    const objectiveMode = document.querySelector("#objective-mode");
    const formula = document.querySelector("#objective-formula");
    const drawPanel = document.querySelector("#draw-panel");
    const drawCanvas = document.querySelector("#draw-canvas");
    const drawReset = document.querySelector("#draw-reset");
    const acquisition = document.querySelector("#acquisition");
    const customAfField = document.querySelector("#custom-af-field");
    const customAf = document.querySelector("#acquisition-formula");
    const sampler = document.querySelector("#sampler");
    const iterations = document.querySelector("#iterations");
    const slider = document.querySelector("#iteration-slider");
    const prevStep = document.querySelector("#prev-step");
    const play = document.querySelector("#play");
    const step = document.querySelector("#step");
    const reset = document.querySelector("#reset");
    const fit = document.querySelector("#plot-fit");
    const zoomIn = document.querySelector("#plot-zoom-in");
    const zoomOut = document.querySelector("#plot-zoom-out");
    const focus = document.querySelector("#plot-focus");

    const rerun = (options = {}) => {
      const previousCursor = options.keepCursor ? appCursor : 0;
      appTrace = createTrace({
        acquisition: acquisition.value,
        acquisitionFormula: customAf.value,
        dimension: Number(dimension.value),
        drawnValues,
        formula: formula.value,
        objectiveMode: objectiveMode.value,
        sampler: sampler.value,
        iterations: iterations.value,
      });
      appCursor = clamp(previousCursor, 0, appTrace.length - 1);
      syncIterationControls();
      renderAppCurrent();
    };

    reset.addEventListener("click", () => {
      stopAppTimer(play);
      plotZoom = 1;
      if (objectiveMode.value === "draw") {
        resetDrawnValues();
        renderDrawCanvas();
      } else {
        formula.value = formulaTemplates[Number(dimension.value)];
      }
      rerun();
    });
    prevStep.addEventListener("click", () => {
      stopAppTimer(play);
      appCursor = Math.max(0, appCursor - 1);
      syncIterationControls();
      renderAppCurrent();
    });
    step.addEventListener("click", () => {
      stopAppTimer(play);
      appCursor = Math.min(appCursor + 1, appTrace.length - 1);
      syncIterationControls();
      renderAppCurrent();
    });
    play.addEventListener("click", () => {
      if (appPlayTimer) {
        stopAppTimer(play);
        return;
      }
      if (appCursor >= appTrace.length - 1) {
        appCursor = 0;
      }
      play.textContent = "정지";
      syncIterationControls();
      renderAppCurrent();
      appPlayTimer = window.setInterval(() => {
        if (appCursor >= appTrace.length - 1) {
          stopAppTimer(play);
          return;
        }
        appCursor += 1;
        syncIterationControls();
        renderAppCurrent();
      }, 650);
    });
    slider.addEventListener("input", () => {
      stopAppTimer(play);
      appCursor = Number(slider.value) - 1;
      syncIterationControls();
      renderAppCurrent();
    });
    formula.addEventListener("input", debounce(() => rerun({ keepCursor: true }), 250));
    customAf.addEventListener("input", debounce(() => rerun({ keepCursor: true }), 250));
    objectiveMode.addEventListener("change", () => {
      stopAppTimer(play);
      if (objectiveMode.value === "draw") {
        dimension.value = "1";
        formula.disabled = true;
      } else {
        formula.disabled = false;
      }
      updateObjectiveMode();
      rerun();
    });
    acquisition.addEventListener("change", () => {
      stopAppTimer(play);
      customAfField.classList.toggle("is-hidden", acquisition.value !== "custom");
      rerun({ keepCursor: true });
    });
    sampler.addEventListener("change", () => rerun({ keepCursor: true }));
    iterations.addEventListener("input", debounce(() => rerun({ keepCursor: true }), 120));
    dimension.addEventListener("change", () => {
      stopAppTimer(play);
      plotZoom = 1;
      const dim = Number(dimension.value);
      if (dim !== 1 && objectiveMode.value === "draw") {
        objectiveMode.value = "formula";
        formula.disabled = false;
      }
      formula.value = formulaTemplates[dim];
      updateFormulaHelp(dim);
      updateObjectiveMode();
      rerun();
    });
    drawReset.addEventListener("click", () => {
      resetDrawnValues();
      renderDrawCanvas();
      rerun();
    });
    initDrawCanvas(drawCanvas, () => rerun({ keepCursor: true }));
    fit.addEventListener("click", () => {
      plotZoom = 1;
      renderAppCurrent();
    });
    zoomIn.addEventListener("click", () => {
      plotZoom = Math.max(0.18, plotZoom * 0.68);
      renderAppCurrent();
    });
    zoomOut.addEventListener("click", () => {
      plotZoom = Math.min(1, plotZoom / 0.68);
      renderAppCurrent();
    });
    focus.addEventListener("click", () => {
      document.body.classList.toggle("plot-focus");
      focus.textContent = document.body.classList.contains("plot-focus") ? "기본 보기" : "크게 보기";
      window.setTimeout(() => {
        if (window.Plotly) {
          ["#main-plot", "#gp-plot"].forEach((selector) => {
            const plot = document.querySelector(selector);
            if (plot) window.Plotly.Plots.resize(plot);
          });
        }
      }, 80);
    });

    resetDrawnValues();
    updateFormulaHelp(Number(dimension.value));
    updateObjectiveMode();
    renderDrawCanvas();
    rerun();
    watchPlotlyAvailability();

    function updateObjectiveMode() {
      const drawMode = objectiveMode.value === "draw";
      drawPanel.classList.toggle("is-hidden", !drawMode);
      formula.disabled = drawMode;
      if (drawMode) {
        updateFormulaHelp(1);
      } else {
        updateFormulaHelp(Number(dimension.value));
      }
    }
  }

  function createTrace(settings) {
    const dimension = Number(settings.dimension) || 1;
    const iterations = Number(settings.iterations) || 12;
    const acquisition = settings.acquisition || "ei";
    const objectiveMode = settings.objectiveMode === "draw" && dimension === 1 ? "draw" : "formula";
    const evaluator = objectiveMode === "draw"
      ? createDrawnEvaluator(settings.drawnValues)
      : createFormulaEvaluator(settings.formula || formulaTemplates[dimension]);
    const acquisitionEvaluator = compileExpression(settings.acquisitionFormula || "mu + 2*sigma", "acquisition");
    const samples = initialPoints(dimension).map((point) => withValue(point, evaluator));
    const samplingFull = buildSamplingRun(settings.sampler || "random", dimension, iterations, evaluator);
    const boScoreCurve = [];
    const boBestCurve = [];
    const samplingScoreCurve = [];
    const samplingBestCurve = [];
    const snapshots = [];

    for (let index = 0; index < iterations; index += 1) {
      const decisionSamples = samples.map((item) => ({ ...item }));
      const candidate = chooseCandidate({
        acquisition,
        acquisitionEvaluator,
        dimension,
        evaluator,
        iteration: index + 1,
        samples,
      });

      samples.push(candidate);
      const best = samples.reduce((winner, item) => (item.value > winner.value ? item : winner), samples[0]);
      const samplingSamples = samplingFull.slice(0, index + 1);
      const samplingBest = samplingSamples.reduce((winner, item) => (item.value > winner.value ? item : winner), samplingSamples[0]);
      boScoreCurve.push(candidate.value);
      boBestCurve.push(best.value);
      samplingScoreCurve.push(samplingFull[index].value);
      samplingBestCurve.push(samplingBest.value);

      snapshots.push({
        acquisition,
        acquisitionFormula: settings.acquisitionFormula || "mu + 2*sigma",
        boBestCurve: [...boBestCurve],
        boScoreCurve: [...boScoreCurve],
        decisionSamples,
        dimension,
        drawnValues: objectiveMode === "draw" ? [...settings.drawnValues] : null,
        formula: settings.formula || formulaTemplates[dimension],
        formulaError: evaluator.error || "",
        iteration: index + 1,
        objectiveMode,
        candidate,
        best,
        samplingBest,
        samplingBestCurve: [...samplingBestCurve],
        samplingScoreCurve: [...samplingScoreCurve],
        samplingSamples,
        samples: samples.map((item) => ({ ...item })),
      });
    }

    return snapshots;
  }

  function chooseCandidate(context) {
    const bestValue = context.samples.reduce((best, item) => Math.max(best, item.value), -Infinity);
    const gpModel = fitExactGP(context.samples, context.dimension);
    let winner = null;
    let winnerScore = -Infinity;

    candidatePool(context.dimension).forEach((point) => {
      const nearest = nearestDistance(point, context.samples, context.dimension);
      if (nearest < 0.018) return;

      const prediction = predictExactGP(gpModel, point);
      const env = {
        mu: prediction.mu,
        sigma: prediction.sigma,
        best: bestValue,
        x: displayX(point.x || 0),
        y: point.y || 0,
        z: point.z || 0,
        t: context.iteration,
      };
      const score = acquisitionScore(context.acquisition, env, context.acquisitionEvaluator);

      if (score > winnerScore) {
        winnerScore = score;
        winner = point;
      }
    });

    return withValue(winner || fallbackPoint(context.dimension, context.iteration), context.evaluator);
  }

  function fitExactGP(samples, dimension) {
    const trainX = samples.map((sample) => pointVector(sample, dimension));
    const trainY = samples.map((sample) => sample.value);
    const yMean = trainY.reduce((sum, value) => sum + value, 0) / trainY.length;
    const yVariance = trainY.reduce((sum, value) => sum + Math.pow(value - yMean, 2), 0) / Math.max(1, trainY.length - 1);
    const yStd = Math.sqrt(yVariance) > 1e-8 ? Math.sqrt(yVariance) : 1;
    const standardizedY = trainY.map((value) => (value - yMean) / yStd);
    const lengthScale = gpLengthScale(dimension);
    let jitter = 1e-6;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const covariance = trainX.map((left, row) => trainX.map((right, col) => {
        const kernelValue = rbfKernel(left, right, lengthScale);
        return row === col ? kernelValue + jitter : kernelValue;
      }));

      try {
        const choleskyFactor = cholesky(covariance);
        return {
          alpha: solveCholesky(choleskyFactor, standardizedY),
          dimension,
          lengthScale,
          lower: choleskyFactor,
          trainX,
          yMean,
          yStd,
        };
      } catch (error) {
        jitter *= 10;
      }
    }

    return { dimension, failed: true, trainX, yMean, yStd };
  }

  function predictExactGP(model, point) {
    if (!model || model.failed) {
      return { mu: model?.yMean || 0, sigma: Math.max(0.1, model?.yStd || 1) };
    }

    const testX = pointVector(point, model.dimension);
    const crossKernel = model.trainX.map((trainPoint) => rbfKernel(testX, trainPoint, model.lengthScale));
    const meanStandardized = dot(crossKernel, model.alpha);
    const projected = solveLower(model.lower, crossKernel);
    const varianceStandardized = Math.max(1e-9, 1 - dot(projected, projected));

    return {
      mu: model.yMean + model.yStd * meanStandardized,
      sigma: Math.max(1e-6, model.yStd * Math.sqrt(varianceStandardized)),
    };
  }

  function acquisitionScore(kind, env, customEvaluator) {
    const sigma = Math.max(env.sigma, 1e-9);
    const improvement = env.mu - env.best - 0.01;
    const z = improvement / sigma;

    if (kind === "pi") {
      return normalCdf(z);
    }
    if (kind === "ucb") {
      return env.mu + 2 * sigma;
    }
    if (kind === "custom") {
      const value = customEvaluator(env);
      return Number.isFinite(value) ? value : env.mu + 2 * sigma;
    }

    return improvement * normalCdf(z) + sigma * normalPdf(z);
  }

  function displayX(normalizedX) {
    return xDomain.min + (normalizedX || 0) * (xDomain.max - xDomain.min);
  }

  function displayPoint(point) {
    if (!point) return point;
    return { ...point, x: displayX(point.x || 0) };
  }

  function displayPoints(points) {
    return (points || []).map((point) => displayPoint(point));
  }

  function xDisplayRange() {
    return [xDomain.min, xDomain.max];
  }

  function objectiveEnv(point) {
    return { ...point, x: displayX(point.x || 0) };
  }

  function pointVector(point, dimension) {
    if (dimension === 1) return [point.x || 0];
    if (dimension === 2) return [point.x || 0, point.y || 0];
    return [point.x || 0, point.y || 0, point.z || 0];
  }

  function gpLengthScale(dimension) {
    const value = 0.22 * Math.sqrt(dimension);
    return Array.from({ length: dimension }, () => value);
  }

  function rbfKernel(left, right, lengthScale) {
    let scaledDistance = 0;
    for (let index = 0; index < left.length; index += 1) {
      const scale = lengthScale[index] || 1;
      const delta = (left[index] - right[index]) / scale;
      scaledDistance += delta * delta;
    }
    return Math.exp(-0.5 * scaledDistance);
  }

  function cholesky(matrix) {
    const size = matrix.length;
    const lower = Array.from({ length: size }, () => Array(size).fill(0));

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col <= row; col += 1) {
        let sum = matrix[row][col];
        for (let index = 0; index < col; index += 1) {
          sum -= lower[row][index] * lower[col][index];
        }

        if (row === col) {
          if (!Number.isFinite(sum) || sum <= 0) throw new Error("Covariance is not positive definite");
          lower[row][col] = Math.sqrt(sum);
        } else {
          lower[row][col] = sum / lower[col][col];
        }
      }
    }

    return lower;
  }

  function solveCholesky(lower, values) {
    return solveUpperFromLower(lower, solveLower(lower, values));
  }

  function solveLower(lower, values) {
    const size = lower.length;
    const solution = Array(size).fill(0);
    for (let row = 0; row < size; row += 1) {
      let sum = values[row];
      for (let col = 0; col < row; col += 1) {
        sum -= lower[row][col] * solution[col];
      }
      solution[row] = sum / lower[row][row];
    }
    return solution;
  }

  function solveUpperFromLower(lower, values) {
    const size = lower.length;
    const solution = Array(size).fill(0);
    for (let row = size - 1; row >= 0; row -= 1) {
      let sum = values[row];
      for (let col = row + 1; col < size; col += 1) {
        sum -= lower[col][row] * solution[col];
      }
      solution[row] = sum / lower[row][row];
    }
    return solution;
  }

  function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
  }

  function normalPdf(value) {
    return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
  }

  function normalCdf(value) {
    return 0.5 * (1 + erf(value / Math.SQRT2));
  }

  function erf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }

  function compileExpression(rawExpression, mode) {
    const allowed = new Set([
      "x", "y", "z", "t", "mu", "sigma", "best",
      "sin", "cos", "tan", "asin", "acos", "atan",
      "abs", "sqrt", "pow", "exp", "log", "min", "max",
      "floor", "ceil", "round", "PI", "E", "pi",
    ]);
    const fallback = mode === "acquisition" ? "mu + 2*sigma" : formulaTemplates[1];
    const expression = String(rawExpression || fallback).trim();
    const normalized = expression.replace(/\^/g, "**");
    const invalidCharacters = normalized.match(/[^0-9A-Za-z_+\-*/%().,\s]/);
    const names = normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const invalidName = names.find((name) => !allowed.has(name));

    if (invalidCharacters || invalidName) {
      return fallbackEvaluator(mode, `수식에 사용할 수 없는 값이 있습니다: ${invalidName || invalidCharacters[0]}`);
    }

    try {
      const fn = new Function(
        "x", "y", "z", "t", "mu", "sigma", "best",
        "sin", "cos", "tan", "asin", "acos", "atan",
        "abs", "sqrt", "pow", "exp", "log", "min", "max",
        "floor", "ceil", "round", "PI", "E", "pi",
        `"use strict"; return (${normalized});`,
      );

      return function evaluate(env) {
        try {
          const value = Number(fn(
            env.x || 0,
            env.y || 0,
            env.z || 0,
            env.t || 0,
            env.mu || 0,
            env.sigma || 0,
            env.best || 0,
            Math.sin,
            Math.cos,
            Math.tan,
            Math.asin,
            Math.acos,
            Math.atan,
            Math.abs,
            Math.sqrt,
            Math.pow,
            Math.exp,
            Math.log,
            Math.min,
            Math.max,
            Math.floor,
            Math.ceil,
            Math.round,
            Math.PI,
            Math.E,
            Math.PI,
          ));
          return Number.isFinite(value) ? value : 0;
        } catch (error) {
          evaluate.error = mode === "acquisition" ? "획득함수 수식을 계산할 수 없습니다." : "평가 대상 함수 수식을 계산할 수 없습니다.";
          return 0;
        }
      };
    } catch (error) {
      return fallbackEvaluator(mode, "수식 문법을 확인하세요.");
    }
  }

  function fallbackEvaluator(mode, message) {
    const fallback = compileExpression(mode === "acquisition" ? "mu + 2*sigma" : formulaTemplates[1], "safe");
    fallback.error = message;
    return fallback;
  }

  function createFormulaEvaluator(rawExpression) {
    const evaluator = compileExpression(rawExpression, "objective");
    function evaluate(point) {
      const value = evaluator(objectiveEnv(point));
      evaluate.error = evaluator.error || "";
      return value;
    }
    evaluate.error = evaluator.error || "";
    return evaluate;
  }

  function createDrawnEvaluator(values) {
    const series = values && values.length ? values : defaultDrawnValues();
    return function evaluate(point) {
      const x = Math.max(0, Math.min(1, point.x || 0));
      const position = x * (series.length - 1);
      const left = Math.floor(position);
      const right = Math.min(series.length - 1, left + 1);
      const mix = position - left;
      return series[left] * (1 - mix) + series[right] * mix;
    };
  }

  function defaultDrawnValues() {
    return Array.from({ length: 160 }, (_, index) => {
      const x = index / 159;
      return 0.55 + Math.sin(x * Math.PI * 2.2) * 0.18 + Math.exp(-Math.pow((x - 0.72) / 0.16, 2)) * 0.45;
    });
  }

  function resetDrawnValues() {
    drawnValues = defaultDrawnValues();
  }

  function initDrawCanvas(canvas, onChange) {
    drawCanvasContext = canvas.getContext("2d");
    let drawing = false;

    const updateFromEvent = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      paintDrawnValue(x, y);
      renderDrawCanvas();
      onChange();
    };

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      updateFromEvent(event);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (drawing) updateFromEvent(event);
    });
    canvas.addEventListener("pointerup", () => {
      drawing = false;
    });
    canvas.addEventListener("pointercancel", () => {
      drawing = false;
    });
  }

  function paintDrawnValue(xRatio, yRatio) {
    const index = Math.max(0, Math.min(drawnValues.length - 1, Math.round(xRatio * (drawnValues.length - 1))));
    const value = 0.2 + (1 - Math.max(0, Math.min(1, yRatio))) * 1.2;
    for (let offset = -2; offset <= 2; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < drawnValues.length) {
        const weight = 1 - Math.abs(offset) / 3;
        drawnValues[target] = drawnValues[target] * (1 - weight) + value * weight;
      }
    }
  }

  function renderDrawCanvas() {
    if (!drawCanvasContext) return;
    const canvas = drawCanvasContext.canvas;
    const width = canvas.width;
    const height = canvas.height;
    drawCanvasContext.clearRect(0, 0, width, height);
    drawCanvasContext.fillStyle = "#ffffff";
    drawCanvasContext.fillRect(0, 0, width, height);
    drawCanvasContext.strokeStyle = "#d8e2de";
    drawCanvasContext.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      drawCanvasContext.beginPath();
      drawCanvasContext.moveTo(0, y);
      drawCanvasContext.lineTo(width, y);
      drawCanvasContext.stroke();
    }
    drawCanvasContext.strokeStyle = "#0f766e";
    drawCanvasContext.lineWidth = 3;
    drawCanvasContext.beginPath();
    drawnValues.forEach((value, index) => {
      const x = (index / (drawnValues.length - 1)) * width;
      const y = height - ((value - 0.2) / 1.2) * height;
      if (index === 0) drawCanvasContext.moveTo(x, y);
      else drawCanvasContext.lineTo(x, y);
    });
    drawCanvasContext.stroke();
  }

  function withValue(point, evaluator) {
    return { ...point, value: evaluator(point) };
  }

  function initialPoints(dimension) {
    if (dimension === 2) {
      return [
        { x: 0.12, y: 0.2 },
        { x: 0.82, y: 0.18 },
        { x: 0.48, y: 0.78 },
      ];
    }
    if (dimension === 3) {
      return [
        { x: 0.12, y: 0.2, z: 0.25 },
        { x: 0.82, y: 0.18, z: 0.62 },
        { x: 0.48, y: 0.78, z: 0.42 },
      ];
    }
    return [{ x: 0.08 }, { x: 0.48 }, { x: 0.86 }];
  }

  function candidatePool(dimension) {
    const points = [];
    if (dimension === 2) {
      for (let yi = 0; yi <= 36; yi += 1) {
        for (let xi = 0; xi <= xCandidateIntervals; xi += 1) {
          points.push({ x: xi / xCandidateIntervals, y: yi / 36 });
        }
      }
      return points;
    }
    if (dimension === 3) {
      for (let zi = 0; zi <= 12; zi += 1) {
        for (let yi = 0; yi <= 12; yi += 1) {
          for (let xi = 0; xi <= xCandidateIntervals; xi += 1) {
            points.push({ x: xi / xCandidateIntervals, y: yi / 12, z: zi / 12 });
          }
        }
      }
      return points;
    }
    for (let xi = 0; xi <= xCandidateIntervals; xi += 1) {
      points.push({ x: xi / xCandidateIntervals });
    }
    return points;
  }

  function buildSamplingRun(kind, dimension, iterations, evaluator) {
    const points = [];
    if (kind === "grid") {
      const pool = candidatePool(dimension);
      const step = Math.max(1, Math.floor(pool.length / iterations));
      for (let index = 0; points.length < iterations; index += step) {
        points.push(pool[index % pool.length]);
      }
    } else if (kind === "lhs") {
      for (let index = 0; index < iterations; index += 1) {
        points.push(lhsPoint(index, iterations, dimension));
      }
    } else {
      for (let index = 0; index < iterations; index += 1) {
        points.push(randomPoint(index + 13, dimension));
      }
    }
    return points.map((point) => withValue(point, evaluator));
  }

  function randomPoint(seed, dimension) {
    const point = {
      x: seededRandom(seed, 1),
      y: seededRandom(seed, 2),
      z: seededRandom(seed, 3),
    };
    if (dimension === 1) return { x: point.x };
    if (dimension === 2) return { x: point.x, y: point.y };
    return point;
  }

  function lhsPoint(index, total, dimension) {
    const jitter = 0.5 / total;
    const point = {
      x: ((index + 0.5) / total + jitter * seededRandom(index, 1)) % 1,
      y: (((index * 7) % total) + 0.5) / total,
      z: (((index * 11) % total) + 0.5) / total,
    };
    if (dimension === 1) return { x: point.x };
    if (dimension === 2) return { x: point.x, y: point.y };
    return point;
  }

  function seededRandom(seed, salt) {
    const value = Math.sin(seed * 928.371 + salt * 137.17) * 43758.5453123;
    return value - Math.floor(value);
  }

  function nearestDistance(point, samples, dimension) {
    return samples.reduce((nearest, sample) => {
      return Math.min(nearest, pointDistance(point, sample, dimension));
    }, Infinity);
  }

  function pointDistance(a, b, dimension) {
    const dx = (a.x || 0) - (b.x || 0);
    const dy = dimension >= 2 ? (a.y || 0) - (b.y || 0) : 0;
    const dz = dimension >= 3 ? (a.z || 0) - (b.z || 0) : 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function fallbackPoint(dimension, iteration) {
    const x = ((iteration * 37) % 100) / 100;
    const y = ((iteration * 53) % 100) / 100;
    const z = ((iteration * 71) % 100) / 100;
    if (dimension === 3) return { x, y, z };
    if (dimension === 2) return { x, y };
    return { x };
  }

  function renderAppCurrent() {
    const snapshot = appTrace[appCursor];
    const sampler = document.querySelector("#sampler");
    const description = document.querySelector("#acquisition-description");
    const errorNode = ensureFormulaStatusNode();

    syncIterationControls();
    description.textContent = acquisitionDescriptions[document.querySelector("#acquisition").value] || acquisitionDescriptions.ei;
    document.querySelector("#stage-title").textContent = snapshot
      ? `${snapshot.dimension}D 평가 대상 함수 f 보기`
      : "BO 평가 대상 함수 f 보기";
    document.querySelector("#iteration-label").textContent = `Iteration ${snapshot ? snapshot.iteration : 0}`;
    document.querySelector("#best-value").textContent = snapshot?.best ? formatPoint(snapshot.best, snapshot.dimension) : "-";
    document.querySelector("#sampling-best-value").textContent = snapshot?.samplingBest ? formatPoint(snapshot.samplingBest, snapshot.dimension) : "-";
    document.querySelector("#sampler-value").textContent = sampler.options[sampler.selectedIndex]?.textContent || sampler.value;
    document.querySelector("#comparison-value").textContent = snapshot?.samplingBest
      ? formatDelta(snapshot.best.value - snapshot.samplingBest.value)
      : "-";
    errorNode.textContent = snapshot?.formulaError || "";
    errorNode.classList.toggle("field-error", Boolean(snapshot?.formulaError));
    renderObjectiveView(document.querySelector("#main-plot"), snapshot);
    renderModelPanel(document.querySelector("#model-panel"), snapshot);
    renderScorePlot(document.querySelector("#score-plot"), snapshot);
    renderComparisonPlot(document.querySelector("#comparison-plot"), snapshot);
  }

  function renderObjectiveView(container, snapshot) {
    if (!container || !snapshot) return;
    if (snapshot.dimension === 2) {
      render2DPreview(container, snapshot);
      return;
    }
    if (snapshot.dimension === 3) {
      render3DPreview(container, snapshot);
      return;
    }
    render1DPreview(container, snapshot);
  }

  function render1DPreview(container, snapshot) {
    const objective = buildLineSeries(snapshot, 440);
    const samples = snapshot.samples || [];
    const samplingSamples = snapshot.samplingSamples || [];
    const candidate = snapshot.candidate;
    const objectiveView = displayPoints(objective);
    const samplesView = displayPoints(samples);
    const samplingView = displayPoints(samplingSamples);
    const candidateView = displayPoint(candidate);
    const yRange = scaledRange(paddedValueRange(objectiveView.concat(samplesView, samplingView, [candidateView]), "value"), plotZoom);
    const xRange = scaledRange(xDisplayRange(), plotZoom);

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: objectiveView.map((point) => point.x),
          y: objectiveView.map((point) => point.value),
          mode: "lines",
          name: "평가 대상 함수 f(x)",
          line: { color: "#0f766e", width: 3 },
        },
        {
          x: samplesView.map((point) => point.x),
          y: samplesView.map((point) => point.value),
          mode: "markers",
          name: "BO 평가점",
          marker: { color: "#2563eb", size: 9 },
        },
        {
          x: samplingView.map((point) => point.x),
          y: samplingView.map((point) => point.value),
          mode: "markers",
          name: "sampling 평가점",
          marker: { color: "#6b7280", size: 8, symbol: "x" },
        },
        {
          x: [candidateView.x],
          y: [candidateView.value],
          mode: "markers",
          name: "다음 BO 후보",
          marker: { color: "#b45309", size: 14, symbol: "diamond" },
        },
      ], withPlotNote(baseLayout("x", "f(x)", { x: xRange, y: yRange }), plotNotes[1]), plotConfig());
      return;
    }

    renderSvgLine(container, objectiveView, samplesView, candidateView, samplingView, xRange, yRange);
  }

  function render2DPreview(container, snapshot) {
    const grid = buildGridSeries(snapshot.formula, 44, 2);
    const samples = snapshot.samples || [];
    const samplingSamples = snapshot.samplingSamples || [];
    const candidate = snapshot.candidate;
    const samplesView = displayPoints(samples);
    const samplingView = displayPoints(samplingSamples);
    const candidateView = displayPoint(candidate);
    const xRange = scaledRange(xDisplayRange(), plotZoom);
    const yRange = scaledRange([0, 1], plotZoom);

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: grid.x,
          y: grid.y,
          z: grid.values,
          type: "contour",
          name: "평가 대상 함수 f(x,y)",
          colorscale: "Viridis",
          contours: { coloring: "heatmap", showlines: false },
          colorbar: { title: "f 값" },
        },
        {
          x: samplesView.map((point) => point.x),
          y: samplesView.map((point) => point.y),
          mode: "markers",
          type: "scatter",
          name: "BO 평가점",
          marker: { color: "#2563eb", size: 9, line: { color: "#ffffff", width: 1 } },
        },
        {
          x: samplingView.map((point) => point.x),
          y: samplingView.map((point) => point.y),
          mode: "markers",
          type: "scatter",
          name: "sampling 평가점",
          marker: { color: "#6b7280", size: 8, symbol: "x", line: { color: "#ffffff", width: 1 } },
        },
        {
          x: [candidateView.x],
          y: [candidateView.y],
          mode: "markers",
          type: "scatter",
          name: "다음 BO 후보",
          marker: { color: "#b45309", size: 15, symbol: "diamond", line: { color: "#ffffff", width: 1 } },
        },
      ], withPlotNote(baseLayout("x", "y", { x: xRange, y: yRange }, false), plotNotes[2]), plotConfig());
      return;
    }

    renderSvgHeatmap(container, grid, samplesView, candidateView, samplingView, xRange, yRange);
  }

  function render3DPreview(container, snapshot) {
    const slice = buildGridSeries(snapshot.formula, 36, 3, 0.5);
    const samples = snapshot.samples || [];
    const samplingSamples = snapshot.samplingSamples || [];
    const candidate = snapshot.candidate;
    const samplesView = displayPoints(samples);
    const samplingView = displayPoints(samplingSamples);
    const candidateView = displayPoint(candidate);
    const xRange = scaledRange(xDisplayRange(), plotZoom);
    const yRange = scaledRange([0, 1], plotZoom);
    const fRange = paddedValueRange(
      slice.values.flat().map((value) => ({ value })).concat(samplesView, samplingView, [candidateView]),
      "value",
    );
    const stemBase = fRange[0];
    const heightGuide = (points, color) => ({
      x: points.flatMap((point) => [point.x, point.x, null]),
      y: points.flatMap((point) => [point.y, point.y, null]),
      z: points.flatMap((point) => [stemBase, point.value, null]),
      mode: "lines",
      type: "scatter3d",
      showlegend: false,
      hoverinfo: "skip",
      line: { color, width: 2 },
    });

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: slice.x,
          y: slice.y,
          z: slice.values,
          surfacecolor: slice.values,
          type: "surface",
          name: "z=0.5 단면 참고 지도",
          opacity: 0.78,
          colorscale: "Viridis",
          contours: {
            z: { show: true, usecolormap: true, project: { z: true } },
          },
          colorbar: { title: "f 값" },
          showscale: true,
          hovertemplate: "x=%{x:.2f}<br>y=%{y:.2f}<br>입력 z=0.50<br>f=%{z:.3f}<extra></extra>",
        },
        heightGuide(samplingView, "rgba(107,114,128,0.35)"),
        heightGuide(samplesView, "rgba(37,99,235,0.35)"),
        {
          x: samplesView.map((point) => point.x),
          y: samplesView.map((point) => point.y),
          z: samplesView.map((point) => point.value),
          customdata: samples.map((point) => point.z),
          mode: "markers",
          type: "scatter3d",
          name: "BO 평가점",
          marker: { color: "#2563eb", size: samples.map((point) => 4 + (point.z || 0) * 4) },
          hovertemplate: "x=%{x:.2f}<br>y=%{y:.2f}<br>입력 z=%{customdata:.2f}<br>f=%{z:.3f}<extra>BO 평가점</extra>",
        },
        {
          x: samplingView.map((point) => point.x),
          y: samplingView.map((point) => point.y),
          z: samplingView.map((point) => point.value),
          customdata: samplingSamples.map((point) => point.z),
          mode: "markers",
          type: "scatter3d",
          name: "sampling 평가점",
          marker: { color: "#6b7280", size: samplingSamples.map((point) => 3 + (point.z || 0) * 3), symbol: "x" },
          hovertemplate: "x=%{x:.2f}<br>y=%{y:.2f}<br>입력 z=%{customdata:.2f}<br>f=%{z:.3f}<extra>sampling 평가점</extra>",
        },
        {
          x: [candidateView.x],
          y: [candidateView.y],
          z: [candidateView.value],
          customdata: [candidate.z],
          mode: "markers",
          type: "scatter3d",
          name: "다음 BO 후보",
          marker: { color: "#b45309", size: 8, symbol: "diamond" },
          hovertemplate: "x=%{x:.2f}<br>y=%{y:.2f}<br>입력 z=%{customdata:.2f}<br>f=%{z:.3f}<extra>다음 BO 후보</extra>",
        },
      ], withPlotNote({
        margin: { t: 24, r: 24, b: 24, l: 24 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        scene: {
          xaxis: { title: "x", range: xRange },
          yaxis: { title: "y", range: yRange },
          zaxis: { title: "f 값", range: fRange },
          aspectmode: "manual",
          aspectratio: { x: 1.55, y: 0.85, z: 0.72 },
          camera: { eye: { x: 1.45, y: 1.45, z: 0.95 } },
        },
        legend: { orientation: "h", y: 1.02 },
      }, plotNotes[3]), plotConfig());
      return;
    }

    renderSvgProjection(container, samplesView, candidateView, samplingView, xRange, yRange);
  }

  function renderModelPanel(panel, snapshot) {
    const visualStage = document.querySelector(".visual-stage");
    const shouldShow = Boolean(panel && snapshot && snapshot.dimension === 1);
    panel?.classList.toggle("is-hidden", !shouldShow);
    visualStage?.classList.toggle("has-model-panel", shouldShow);
    if (!shouldShow) return;

    const series = build1DDecisionSeries(snapshot, 180);
    renderGpPosteriorPlot(document.querySelector("#gp-plot"), snapshot, series);
  }

  function build1DDecisionSeries(snapshot, count) {
    const decisionSamples = snapshot.decisionSamples?.length
      ? snapshot.decisionSamples
      : (snapshot.samples || []);
    const gpModel = fitExactGP(decisionSamples, 1);
    const series = Array.from({ length: count }, (_, index) => {
      const x = index / (count - 1);
      const prediction = predictExactGP(gpModel, { x });
      return {
        x,
        lower: prediction.mu - 1.96 * prediction.sigma,
        mu: prediction.mu,
        sigma: prediction.sigma,
        upper: prediction.mu + 1.96 * prediction.sigma,
      };
    });

    const candidatePrediction = predictExactGP(gpModel, snapshot.candidate);
    return {
      candidateMu: candidatePrediction.mu,
      decisionSamples,
      series,
    };
  }

  function renderGpPosteriorPlot(container, snapshot, modelView) {
    if (!container || !modelView) return;
    const series = modelView.series;
    const seriesView = series.map((point) => ({ ...point, x: displayX(point.x) }));
    const decisionSamplesView = displayPoints(modelView.decisionSamples);
    const candidateView = displayPoint(snapshot.candidate);
    const xRange = scaledRange(xDisplayRange(), plotZoom);
    const yRange = paddedValueRange(
      series.flatMap((point) => [{ value: point.lower }, { value: point.upper }]).concat(decisionSamplesView),
      "value",
    );

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: seriesView.map((point) => point.x),
          y: seriesView.map((point) => point.upper),
          mode: "lines",
          name: "95% upper",
          line: { color: "rgba(37,99,235,0)" },
          hoverinfo: "skip",
          showlegend: false,
        },
        {
          x: seriesView.map((point) => point.x),
          y: seriesView.map((point) => point.lower),
          mode: "lines",
          name: "95% band",
          fill: "tonexty",
          fillcolor: "rgba(37,99,235,0.16)",
          line: { color: "rgba(37,99,235,0)" },
        },
        {
          x: seriesView.map((point) => point.x),
          y: seriesView.map((point) => point.mu),
          mode: "lines",
          name: "GP mean",
          line: { color: "#2563eb", width: 2 },
        },
        {
          x: decisionSamplesView.map((point) => point.x),
          y: decisionSamplesView.map((point) => point.value),
          mode: "markers",
          name: "used observations",
          marker: { color: "#111827", size: 6 },
        },
        {
          x: [candidateView.x],
          y: [modelView.candidateMu],
          mode: "markers",
          name: "selected x",
          marker: { color: "#b45309", size: 10, symbol: "diamond" },
        },
      ], modelPlotLayout("x", "posterior f(x)", { x: xRange, y: yRange }), modelPlotConfig());
      return;
    }

    renderModelFallback(container, "GP posterior");
  }

  function modelPlotLayout(xTitle, yTitle, ranges) {
    return {
      margin: { t: 18, r: 18, b: 36, l: 52 },
      xaxis: { title: xTitle, range: ranges.x, fixedrange: true },
      yaxis: { title: yTitle, range: ranges.y, fixedrange: true },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      legend: { orientation: "h", y: 1.12 },
      showlegend: true,
    };
  }

  function modelPlotConfig() {
    return {
      responsive: true,
      displayModeBar: false,
      displaylogo: false,
    };
  }

  function renderModelFallback(container, label) {
    container.innerHTML = `<div class="fallback-plot">${label}</div>`;
  }

  function buildLineSeries(snapshot, count) {
    const evaluator = snapshot.objectiveMode === "draw"
      ? createDrawnEvaluator(snapshot.drawnValues)
      : createFormulaEvaluator(snapshot.formula || formulaTemplates[1]);
    return Array.from({ length: count }, (_, index) => {
      const x = index / (count - 1);
      return withValue({ x }, evaluator);
    });
  }

  function buildGridSeries(formula, count, dimension, fixedZ) {
    const evaluator = createFormulaEvaluator(formula || formulaTemplates[dimension]);
    const axis = Array.from({ length: count }, (_, index) => index / (count - 1));
    const values = axis.map((y) => axis.map((x) => evaluator({ x, y, z: fixedZ || 0.5 })));
    return { x: axis.map((x) => displayX(x)), y: axis, values };
  }

  function baseLayout(xTitle, yTitle, ranges, lockAspect) {
    const layout = {
      margin: { t: 24, r: 24, b: 48, l: 54 },
      xaxis: { title: xTitle, range: ranges?.x || [0, 1] },
      yaxis: { title: yTitle, range: ranges?.y || [0, 1] },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      legend: { orientation: "h", y: 1.08 },
      dragmode: "zoom",
    };
    if (lockAspect) {
      layout.yaxis.scaleanchor = "x";
      layout.yaxis.scaleratio = 1;
      layout.yaxis.constrain = "domain";
    }
    return layout;
  }

  function withPlotNote(layout, note) {
    layout.margin = { ...(layout.margin || {}), t: Math.max(layout.margin?.t || 0, 76) };
    layout.annotations = [
      ...(layout.annotations || []),
      {
        text: note,
        xref: "paper",
        yref: "paper",
        x: 0.01,
        y: 0.98,
        xanchor: "left",
        yanchor: "top",
        align: "left",
        showarrow: false,
        font: { size: 12, color: "#4f625b" },
        bgcolor: "rgba(255,255,255,0.86)",
        bordercolor: "#d8e2de",
        borderpad: 4,
      },
    ];
    return layout;
  }

  function plotConfig() {
    return {
      responsive: true,
      scrollZoom: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    };
  }

  function paddedValueRange(points, key) {
    const values = points.map((point) => Number(point?.[key])).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = span * 0.12;
    return [min - pad, max + pad];
  }

  function scaledRange(range, scale) {
    const center = (range[0] + range[1]) / 2;
    const half = ((range[1] - range[0]) * scale) / 2;
    return [center - half, center + half];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function renderSvgLine(container, objective, samples, candidate, samplingSamples, xRange, yRange) {
    const width = 920;
    const height = 420;
    const pad = 68;
    const minY = yRange[0];
    const maxY = yRange[1];
    const span = maxY - minY || 1;
    const toX = (x) => pad + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - pad * 2);
    const toY = (value) => height - pad - ((value - minY) / span) * (height - pad * 2);
    const inRange = (point) => point.x >= xRange[0] && point.x <= xRange[1] && point.value >= yRange[0] && point.value <= yRange[1];
    const line = objective.filter(inRange).map((point) => `${toX(point.x).toFixed(1)},${toY(point.value).toFixed(1)}`).join(" ");
    const sampleDots = samples.filter(inRange).map((point) =>
      `<circle cx="${toX(point.x).toFixed(1)}" cy="${toY(point.value).toFixed(1)}" r="5.5" fill="#2563eb"></circle>`,
    ).join("");
    const samplingDots = samplingSamples.filter(inRange).map((point) =>
      `<text x="${(toX(point.x) - 4).toFixed(1)}" y="${(toY(point.value) + 4).toFixed(1)}" fill="#6b7280" font-size="13">x</text>`,
    ).join("");
    const candidateDot = inRange(candidate)
      ? `<rect x="${(toX(candidate.x) - 7).toFixed(1)}" y="${(toY(candidate.value) - 7).toFixed(1)}" width="14" height="14" transform="rotate(45 ${toX(candidate.x).toFixed(1)} ${toY(candidate.value).toFixed(1)})" fill="#b45309"></rect>`
      : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="1D target function plot">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#d8e2de"></line>
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#d8e2de"></line>
        <polyline points="${line}" fill="none" stroke="#0f766e" stroke-width="3"></polyline>
        ${samplingDots}
        ${sampleDots}
        ${candidateDot}
        <text x="${pad}" y="24" fill="#5f6f68" font-size="14">1D 평가 대상 함수 f(x)</text>
        <text x="${pad}" y="44" fill="#4f625b" font-size="12">선=f(x), 파란 점=BO 평가점, 회색 x=sampling 평가점</text>
        <text x="${pad}" y="60" fill="#4f625b" font-size="12">주황 마름모=다음 BO 후보</text>
      </svg>
    `;
  }

  function renderSvgHeatmap(container, grid, samples, candidate, samplingSamples, xRange, yRange) {
    const width = 760;
    const height = 520;
    const pad = 68;
    const flat = grid.values.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const span = max - min || 1;
    const cellX = (width - pad * 2) / grid.x.length;
    const cellY = (height - pad * 2) / grid.y.length;
    const toColor = (value) => {
      const t = (value - min) / span;
      const r = Math.round(19 + t * 220);
      const g = Math.round(118 + t * 70);
      const b = Math.round(110 - t * 70);
      return `rgb(${r},${g},${b})`;
    };
    const cells = grid.values.map((row, yi) => row.map((value, xi) =>
      `<rect x="${pad + xi * cellX}" y="${height - pad - (yi + 1) * cellY}" width="${cellX + 0.5}" height="${cellY + 0.5}" fill="${toColor(value)}"></rect>`,
    ).join("")).join("");
    const toX = (x) => pad + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - pad * 2);
    const toY = (y) => height - pad - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - pad * 2);
    const pointInRange = (point) => point.x >= xRange[0] && point.x <= xRange[1] && point.y >= yRange[0] && point.y <= yRange[1];
    const dot = (point, color, radius) =>
      pointInRange(point)
        ? `<circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="${radius}" fill="${color}" stroke="#ffffff" stroke-width="1"></circle>`
        : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="2D heatmap">
        <rect width="${width}" height="${height}" fill="#ffffff"></rect>
        ${cells}
        ${samplingSamples.map((point) => dot(point, "#6b7280", 4)).join("")}
        ${samples.map((point) => dot(point, "#2563eb", 5)).join("")}
        ${dot(candidate, "#b45309", 8)}
        <text x="${pad}" y="28" fill="#5f6f68" font-size="14">2D 평가 대상 함수 f(x,y)</text>
        <text x="${pad}" y="48" fill="#4f625b" font-size="12">색=f(x,y) 값(노랑일수록 높음), 점=실제 평가 위치</text>
        <text x="${pad}" y="64" fill="#4f625b" font-size="12">주황 마름모=다음 BO 후보</text>
        <text x="${width - pad - 12}" y="${height - 12}" fill="#5f6f68" font-size="13">x</text>
        <text x="16" y="${pad}" fill="#5f6f68" font-size="13">y</text>
      </svg>
    `;
  }

  function renderSvgProjection(container, samples, candidate, samplingSamples, xRange, yRange) {
    const width = 760;
    const height = 520;
    const pad = 72;
    const sceneRange = [0, 1];
    const inRange = (point) =>
      point.x >= xRange[0] && point.x <= xRange[1] &&
      point.y >= yRange[0] && point.y <= yRange[1] &&
      point.z >= sceneRange[0] && point.z <= sceneRange[1];
    const toX = (x) => pad + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - pad * 2);
    const toY = (y) => height - pad - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - pad * 2);
    const dot = (point, color, radius) =>
      inRange(point)
        ? `<circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="${radius + point.z * 6}" fill="${color}" opacity="${0.45 + point.z * 0.5}" stroke="#ffffff" stroke-width="1"></circle>`
        : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="3D projection">
        <rect width="${width}" height="${height}" fill="#ffffff"></rect>
        <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#f5faf7" stroke="#d8e2de"></rect>
        ${samplingSamples.map((point) => dot(point, "#6b7280", 4)).join("")}
        ${samples.map((point) => dot(point, "#2563eb", 5)).join("")}
        ${dot(candidate, "#b45309", 8)}
        <text x="${pad}" y="28" fill="#5f6f68" font-size="14">3D 평가 대상 함수 f(x,y,z)</text>
        <text x="${pad}" y="48" fill="#4f625b" font-size="12">fallback: x-y 위치를 보여주며, 점 크기/진하기=입력 z</text>
        <text x="${pad}" y="64" fill="#4f625b" font-size="12">Plotly 화면에서는 점 높이=실제 z에서 계산한 f 값</text>
      </svg>
    `;
  }

  function renderScorePlot(container, snapshot) {
    if (!container || !snapshot) return;
    const boScores = snapshot.boScoreCurve || [];
    const samplingScores = snapshot.samplingScoreCurve || [];
    const xValues = Array.from({ length: Math.max(boScores.length, samplingScores.length) }, (_, index) => index + 1);

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: xValues.slice(0, boScores.length),
          y: boScores,
          mode: "markers",
          name: "BO score",
          marker: { color: "#0f766e", size: 5, opacity: 0.9 },
        },
        {
          x: xValues.slice(0, samplingScores.length),
          y: samplingScores,
          mode: "markers",
          name: "sampling score",
          marker: { color: "#6b7280", size: 5, symbol: "x", opacity: 0.85 },
        },
      ], miniPlotLayout(), miniPlotConfig());
      return;
    }

    renderMiniSvgLines(container, boScores, samplingScores, {
      aria: "각 iteration에서 찍은 점수 비교",
      connect: false,
      primaryColor: "#0f766e",
      primaryLabel: "BO score",
      secondaryColor: "#6b7280",
      secondaryLabel: "sampling",
    });
  }

  function renderComparisonPlot(container, snapshot) {
    if (!container || !snapshot) return;
    const boBest = snapshot.boBestCurve || [];
    const samplingBest = snapshot.samplingBestCurve || [];
    const xValues = Array.from({ length: Math.max(boBest.length, samplingBest.length) }, (_, index) => index + 1);

    if (window.Plotly) {
      window.Plotly.react(container, [
        {
          x: xValues.slice(0, boBest.length),
          y: boBest,
          mode: "lines+markers",
          name: "BO",
          line: { color: "#2563eb", width: 2, shape: "hv" },
          marker: { size: 4 },
        },
        {
          x: xValues.slice(0, samplingBest.length),
          y: samplingBest,
          mode: "lines+markers",
          name: "sampling",
          line: { color: "#6b7280", width: 2, dash: "dot", shape: "hv" },
          marker: { size: 4 },
        },
      ], miniPlotLayout(), miniPlotConfig());
      return;
    }

    renderMiniSvgLines(container, boBest, samplingBest, {
      aria: "BO와 sampling best value 비교",
      connect: true,
      primaryColor: "#2563eb",
      primaryLabel: "BO best",
      secondaryColor: "#6b7280",
      secondaryLabel: "sampling best",
      step: true,
    });
  }

  function miniPlotLayout() {
    return {
      margin: { t: 10, r: 8, b: 22, l: 32 },
      xaxis: {
        fixedrange: true,
        gridcolor: "#eef2ef",
        nticks: 4,
        tickfont: { size: 10 },
        zeroline: false,
      },
      yaxis: {
        fixedrange: true,
        gridcolor: "#eef2ef",
        nticks: 4,
        tickfont: { size: 10 },
        zeroline: false,
      },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      showlegend: false,
    };
  }

  function miniPlotConfig() {
    return {
      responsive: true,
      displayModeBar: false,
      displaylogo: false,
    };
  }

  function watchPlotlyAvailability() {
    if (plotlyUpgradeDone || !document.querySelector("#main-plot")) return;
    if (window.Plotly) {
      plotlyUpgradeDone = true;
      renderAppCurrent();
      return;
    }
    if (plotlyUpgradeTimer) return;

    let attempts = 0;
    plotlyUpgradeTimer = window.setInterval(() => {
      attempts += 1;
      if (window.Plotly) {
        window.clearInterval(plotlyUpgradeTimer);
        plotlyUpgradeTimer = null;
        plotlyUpgradeDone = true;
        renderAppCurrent();
      } else if (attempts >= 80) {
        window.clearInterval(plotlyUpgradeTimer);
        plotlyUpgradeTimer = null;
      }
    }, 250);
  }

  function renderMiniSvgLines(container, primary, secondary, options) {
    const width = 260;
    const height = 150;
    const pad = 28;
    const primaryColor = options.primaryColor || "#2563eb";
    const secondaryColor = options.secondaryColor || "#6b7280";
    const values = primary.concat(secondary);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const maxLen = Math.max(primary.length, secondary.length, 2);
    const toX = (index) => pad + (index / (maxLen - 1)) * (width - pad * 2);
    const toY = (value) => height - pad - ((value - min) / span) * (height - pad * 2);
    const path = (series) => series.map((value, index) => `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`).join(" ");
    const stepPath = (series) => series.map((value, index) => {
      const current = `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`;
      if (index === 0) return current;
      return `${toX(index).toFixed(1)},${toY(series[index - 1]).toFixed(1)} ${current}`;
    }).join(" ");
    const dots = (series, color) => series.map((value, index) =>
      `<circle cx="${toX(index).toFixed(1)}" cy="${toY(value).toFixed(1)}" r="3.5" fill="${color}"></circle>`,
    ).join("");
    const secondaryLine = options.connect === false ? "" :
      `<polyline points="${options.step ? stepPath(secondary) : path(secondary)}" fill="none" stroke="${secondaryColor}" stroke-width="2" stroke-dasharray="4 4"></polyline>`;
    const primaryLine = options.connect === false ? "" :
      `<polyline points="${options.step ? stepPath(primary) : path(primary)}" fill="none" stroke="${primaryColor}" stroke-width="2.5"></polyline>`;

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="${options.aria}">
        <rect width="${width}" height="${height}" fill="#ffffff"></rect>
        ${secondaryLine}
        ${primaryLine}
        ${dots(secondary, secondaryColor)}
        ${dots(primary, primaryColor)}
      </svg>
    `;
  }

  function updateFormulaHelp(dimension) {
    const help = document.querySelector("#objective-formula-help");
    if (!help) return;
    if (dimension === 1) {
      help.textContent = "1D: 변수 x는 0~10 범위입니다. BO 후보 x 간격은 0.1입니다.";
    } else if (dimension === 2) {
      help.textContent = "2D: 변수 x는 0~10, y는 0~1 범위입니다. BO 후보 x 간격은 0.1입니다.";
    } else {
      help.textContent = "3D: 변수 x는 0~10, y와 z는 0~1 범위입니다. BO 후보 x 간격은 0.1이고, 점 높이는 실제 f 값입니다.";
    }
  }

  function ensureFormulaStatusNode() {
    let node = document.querySelector("#formula-status");
    if (!node) {
      node = document.createElement("p");
      node.id = "formula-status";
      node.className = "field-help";
      document.querySelector("#objective-formula-help").after(node);
    }
    return node;
  }

  function syncIterationControls() {
    const slider = document.querySelector("#iteration-slider");
    const readout = document.querySelector("#iteration-readout");
    if (!slider || !readout) return;

    const total = Math.max(1, appTrace.length);
    slider.max = String(total);
    slider.value = String(Math.min(total, appCursor + 1));
    readout.textContent = `${slider.value} / ${total}`;
  }

  function formatPoint(point, dimension) {
    return `${point.value.toFixed(3)} at ${formatCoordinates(point, dimension)}`;
  }

  function formatDelta(delta) {
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(3)} (BO - sampling)`;
  }

  function formatCoordinates(point, dimension) {
    const x = displayX(point.x || 0);
    if (dimension === 3) {
      return `x=${x.toFixed(2)}, y=${point.y.toFixed(2)}, z=${point.z.toFixed(2)}`;
    }
    if (dimension === 2) {
      return `x=${x.toFixed(2)}, y=${point.y.toFixed(2)}`;
    }
    return `x=${x.toFixed(2)}`;
  }

  function stopAppTimer(playButton) {
    if (appPlayTimer) {
      window.clearInterval(appPlayTimer);
      appPlayTimer = null;
    }
    if (playButton) playButton.textContent = "재생";
  }

  function debounce(fn, delay) {
    let id = 0;
    return function () {
      window.clearTimeout(id);
      id = window.setTimeout(fn, delay);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}());
