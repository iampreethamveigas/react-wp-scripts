/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// <REACT-WP-SCRIPTS>
// Sections below modified from react-scripts to serve cross-domain.
// </REACT-WP-SCRIPTS>

'use strict';

// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

var SockJS = require('sockjs-client');
var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('react-dev-utils/launchEditorEndpoint');
var formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
	// Keep this sync with errorOverlayMiddleware.js
	fetch(
		launchEditorEndpoint +
			'?fileName=' +
			window.encodeURIComponent(errorLocation.fileName) +
			'&lineNumber=' +
			window.encodeURIComponent(errorLocation.lineNumber || 1) +
			'&colNumber=' +
			window.encodeURIComponent(errorLocation.colNumber || 1)
	);
});

// We need to keep track of if there has been a runtime error.
// Essentially, we cannot guarantee application state was not corrupted by the
// runtime error. To prevent confusing behavior, we forcibly reload the entire
// application. This is handled below when we are notified of a compile (code
// change).
// See https://github.com/facebook/create-react-app/issues/3096
var hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
	onError: function() {
		hadRuntimeError = true;
	},
	filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
	module.hot.dispose(function() {
		// TODO: why do we need this?
		ErrorOverlay.stopReportingRuntimeErrors();
	});
}

// <REACT-WP-SCRIPTS>
// Replace connection creation to allow using the script's domain
// (localhost:3000) rather than the web root.
function getCurrentScriptSource() {
	// `document.currentScript` is the most accurate way to find the current script,
	// but is not supported in all browsers.
	if (document.currentScript) { return document.currentScript.getAttribute('src'); }
	// Fall back to getting all scripts in the document.
	const scriptElements = document.scripts || [];
	const currentScript = scriptElements[scriptElements.length - 1];
	if (currentScript) { return currentScript.getAttribute('src'); }
	// Fail as there was no script to use.
	throw new Error('[WDS] Failed to get current script source.');
}

// Connect to WebpackDevServer via a socket.
let scriptHost = getCurrentScriptSource().replace(/\/[^\/]+$/, '');
const urlParts = url.parse((scriptHost || '/'), false, true);
var connection = new SockJS(
	url.format({
		protocol: urlParts.protocol,
		hostname: urlParts.hostname,
		port: urlParts.port,
		// Hardcoded in WebpackDevServer
		pathname: '/sockjs-node',
	})
);
// </REACT-WP-SCRIPTS>

// Unlike WebpackDevServer client, we won't try to reconnect
// to avoid spamming the console. Disconnect usually happens
// when developer stops the server.
connection.onclose = function() {
	if (typeof console !== 'undefined' && typeof console.info === 'function') {
		console.info(
			'The development server has disconnected.\nRefresh the page if necessary.'
		);
	}
};

// Remember some state related to hot module replacement.
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

function clearOutdatedErrors() {
	// Clean up outdated compile errors, if any.
	if (typeof console !== 'undefined' && typeof console.clear === 'function') {
		if (hasCompileErrors) {
			console.clear();
		}
	}
}

// Successful compilation.
function handleSuccess() {
	clearOutdatedErrors();

	var isHotUpdate = !isFirstCompilation;
	isFirstCompilation = false;
	hasCompileErrors = false;

	// Attempt to apply hot updates or reload.
	if (isHotUpdate) {
		tryApplyUpdates(function onHotUpdateSuccess() {
			// Only dismiss it when we're sure it's a hot update.
			// Otherwise it would flicker right before the reload.
			ErrorOverlay.dismissBuildError();
		});
	}
}

// Compilation with warnings (e.g. ESLint).
function handleWarnings(warnings) {
	clearOutdatedErrors();

	var isHotUpdate = !isFirstCompilation;
	isFirstCompilation = false;
	hasCompileErrors = false;

	function printWarnings() {
		// Print warnings to the console.
		var formatted = formatWebpackMessages({
			warnings: warnings,
			errors: [],
		});

		if (typeof console !== 'undefined' && typeof console.warn === 'function') {
			for (var i = 0; i < formatted.warnings.length; i++) {
				if (i === 5) {
					console.warn(
						'There were more warnings in other files.\n' +
							'You can find a complete log in the terminal.'
					);
					break;
				}
				console.warn(stripAnsi(formatted.warnings[i]));
			}
		}
	}

	// Attempt to apply hot updates or reload.
	if (isHotUpdate) {
		tryApplyUpdates(function onSuccessfulHotUpdate() {
			// Only print warnings if we aren't refreshing the page.
			// Otherwise they'll disappear right away anyway.
			printWarnings();
			// Only dismiss it when we're sure it's a hot update.
			// Otherwise it would flicker right before the reload.
			ErrorOverlay.dismissBuildError();
		});
	} else {
		// Print initial warnings immediately.
		printWarnings();
	}
}

// Compilation with errors (e.g. syntax error or missing modules).
function handleErrors(errors) {
	clearOutdatedErrors();

	isFirstCompilation = false;
	hasCompileErrors = true;

	// "Massage" webpack messages.
	var formatted = formatWebpackMessages({
		errors: errors,
		warnings: [],
	});

	// Only show the first error.
	ErrorOverlay.reportBuildError(formatted.errors[0]);

	// Also log them to the console.
	if (typeof console !== 'undefined' && typeof console.error === 'function') {
		for (var i = 0; i < formatted.errors.length; i++) {
			console.error(stripAnsi(formatted.errors[i]));
		}
	}

	// Do not attempt to reload now.
	// We will reload on next success instead.
}

// There is a newer version of the code available.
function handleAvailableHash(hash) {
	// Update last known compilation hash.
	mostRecentCompilationHash = hash;
}

// Handle messages from the server.
connection.onmessage = function(e) {
	var message = JSON.parse(e.data);
	switch (message.type) {
		case 'hash':
			handleAvailableHash(message.data);
			break;
		case 'still-ok':
		case 'ok':
			handleSuccess();
			break;
		case 'content-changed':
			// Triggered when a file from `contentBase` changed.
			window.location.reload();
			break;
		case 'warnings':
			handleWarnings(message.data);
			break;
		case 'errors':
			handleErrors(message.data);
			break;
		default:
		// Do nothing.
	}
};

// Is there a newer version of this code available?
function isUpdateAvailable() {
	/* globals __webpack_hash__ */
	// __webpack_hash__ is the hash of the current compilation.
	// It's a global variable injected by Webpack.
	return mostRecentCompilationHash !== __webpack_hash__;
}

// Webpack disallows updates in other states.
function canApplyUpdates() {
	return module.hot.status() === 'idle';
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(onHotUpdateSuccess) {
	if (!module.hot) {
		// HotModuleReplacementPlugin is not in Webpack configuration.
		window.location.reload();
		return;
	}

	if (!isUpdateAvailable() || !canApplyUpdates()) {
		return;
	}

	function handleApplyUpdates(err, updatedModules) {
		if (err || !updatedModules || hadRuntimeError) {
			window.location.reload();
			return;
		}

		if (typeof onHotUpdateSuccess === 'function') {
			// Maybe we want to do something.
			onHotUpdateSuccess();
		}

		if (isUpdateAvailable()) {
			// While we were updating, there was a new update! Do it again.
			tryApplyUpdates();
		}
	}

	// https://webpack.github.io/docs/hot-module-replacement.html#check
	var result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

	// // Webpack 2 returns a Promise instead of invoking a callback
	if (result && result.then) {
		result.then(
			function(updatedModules) {
				handleApplyUpdates(null, updatedModules);
			},
			function(err) {
				handleApplyUpdates(err, null);
			}
		);
	}
}
