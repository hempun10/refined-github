import './image-lightbox.css';

import delegate, {type DelegateEvent} from 'delegate-it';
import React from 'dom-chef';
import {isAlteredClick} from 'filter-altered-clicks';
import {$$, $optional, closestElementOptional, elementExists} from 'select-dom';

import features from '../feature-manager.js';

function openImage(event: DelegateEvent<MouseEvent, HTMLAnchorElement>): void {
	if (event.defaultPrevented || isAlteredClick(event)) {
		return;
	}

	const link = event.delegateTarget;
	const image = $optional('img', link);
	if (
		!image || image.width < 96 || image.height < 64
		|| link.textContent.trim().length > 0 || $$('img', link).length !== 1
		|| image.matches(':is(.avatar, .emoji, .octicon)')
		|| Boolean(closestElementOptional(':is(button, summary, [role="button"], [contenteditable="true"])', link))
		|| !['http:', 'https:'].includes(new URL(link.href).protocol)
		|| ![image.src, image.currentSrc, image.getAttribute('data-canonical-src')].includes(link.href)
		|| elementExists('dialog[open]')
	) {
		return;
	}

	event.preventDefault();
	const status = <span role="status" />;
	const preview = <img
		src={image.currentSrc.length > 0 ? image.currentSrc : image.src}
		alt={image.alt.length > 0 ? image.alt : 'Image preview'}
	/>;
	const dialog = document.createElement('dialog');
	dialog.className = 'rgh-image-lightbox';
	dialog.setAttribute('aria-label', 'Image preview');
	dialog.append(
		<div className="d-flex flex-justify-between flex-items-center mb-2">
			<a href={link.href} target="_blank" rel="noopener noreferrer">Open original image</a>
			<form method="dialog">
				<button className="btn btn-sm" aria-label="Close image preview">Close</button>
			</form>
		</div>,
		preview,
		status,
	);
	preview.addEventListener('error', () => {
		status.textContent = 'Could not load the image. Use the original image link.';
	}, {once: true});
	dialog.addEventListener('click', click => {
		if (click.target !== dialog) {
			return;
		}

		const bounds = dialog.getBoundingClientRect();
		if (
			click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top
			|| click.clientY > bounds.bottom
		) {
			dialog.close();
		}
	});
	dialog.addEventListener('close', () => {
		dialog.remove();
	}, {once: true});
	document.body.append(dialog);
	dialog.showModal();
}

function init(signal: AbortSignal): void {
	delegate('.markdown-body a:has(img)', 'click', openImage, {signal});
	signal.addEventListener('abort', () => {
		const dialog = $optional('dialog.rgh-image-lightbox');
		if (!dialog) {
			return;
		}

		dialog.close();
		dialog.remove();
	}, {once: true});
}

void features.add(import.meta.url, {init});

/*

Test URLs:
- https://github.com/refined-github/refined-github
- https://github.com/refined-github/sandbox/issues/77

*/
