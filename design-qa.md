# Imagine composer design QA

Final result: passed

Reference: user screenshots codex-clipboard-c374f9f0-c6d6-4cf3-91ca-ea1d8d793c19.png (full composer) and codex-clipboard-01198d38-86d4-4ede-a255-01c8efb58018.png (muted speaker).
Prototype: http://127.0.0.1:4173/
Evidence: .preview/grok-composer-desktop.png, .preview/grok-composer-muted.png, .preview/grok-composer-mobile.png (local proof captures).

Compared reference and implementation together, including full composer and focused toolbar, attachment, speaker, and submit surfaces. Reference density is approximately twice the application control density; application desktop viewport is 1710 x 890, mobile 390 x 844. Matched comparison state: video, uploaded photo, 480p, 6s, sound enabled, empty prompt. Dynamic thumbnail uses the actual selected file rather than the reference avatar.

Dark warm panel, rounded border, muted placeholder, pill controls, outlined active speaker and blue circular arrow follow the supplied design. Classroom Studio retains its two-column preview, class navigation and quota display. Mobile stacks columns and wraps controls with the submit action visible. Microphone and unsupported reference modes are not included.

Finding resolved: P2 filmstrip differed from reference camera; replaced composer filmstrip with video-camera icon. Existing history icon remains unchanged. No unresolved P0/P1/P2 findings.

Verified by browser interactions: photo attachment appears and aspect selector disappears; deleting photo restores selector; sound switches aria-pressed true/false and Volume2/VolumeX; selecting 720p and 10s updates selected state; mobile controls remain within panel. Browser console has no captured errors. TypeScript and Vite production build passed. No paid generation was performed. Existing audio request handling remains unchanged.
