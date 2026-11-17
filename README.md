# Francophone Social Mixer

A final speaking task for Tennessee Language Center’s French Beginner 1 course. Learners choose a goal, meet three guests, and prepare a French voice note and a Can-Do reflection for the instructor.

## Try the scripted demo

From the repository folder, run `python -m http.server 8000 --directory public` (on Windows, try `py` in place of `python`). Open http://localhost:8000 and pick **Scripted demo**. Scripted guest audio uses your browser’s text-to-speech support. A French voice must be available to hear it. The replies also appear in French on screen. The final voice note uses the browser microphone and can be downloaded with the reflection. The demo requires no OpenAI account.

The Can-Do menu in `public/curriculum.js` uses draft wording based on the course objectives. Verify that wording against the finalized course list before sharing with learners.

## Deploy to Netlify

1. In Netlify, choose **Add new project → Import an existing project → GitHub**, then select **cbbarnet79/Francophonesocialmixer**.
2. Deploy the `main` branch. The included `netlify.toml` sets the publish directory to `public` and the functions directory to `netlify/functions`. Leave the build command blank.
3. In the Netlify project, go to **Project configuration → Environment variables**. Add `OPENAI_API_KEY` with your API key and `MIXER_CLASS_CODE` with a long random code for your pilot. Include the Functions scope if your plan shows a scope selector. Share only the class code with learners.
4. Trigger a new deploy after saving the variables. Open the project's HTTPS URL. Select **Live French voice**, enter the class code, and test the microphone and one full round before distributing the link.

OpenAI API billing is separate from a ChatGPT subscription. If the site reports a 429, check the OpenAI project’s API billing, credits, and usage limits.

## Share learner work

The recording and written reflection are prepared in the browser. Learners download the two files and send them together through Matrix or the instructor’s chosen channel. The live guest conversation sends microphone audio to OpenAI. Optional AI feedback sends only the final voice note and selected Can-Do to OpenAI when the learner requests it. The app does not save the audio or suggestions on a server. Guest notes and the written reflection are excluded from the feedback request. Learners may use a first name or a made-up name. They should leave out their last name and use fictional contact details. Instructors access learner files after learners share them through Matrix or the chosen class channel. This version uses a shared access code for live voice and does not create user accounts or save learner work on a server. Firebase login and storage can be added in a later milestone.
