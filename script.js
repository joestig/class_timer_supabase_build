"use strict";

        const schedules = {
            regular: [
                { name: "Block 1", start: "8:24", end: "9:31" },
                { name: "Block 2", start: "9:36", end: "10:43" },
                { name: "Block 3", start: "10:48", end: "11:55" },
                { name: "Lunch", start: "12:00", end: "12:35" },
                { name: "Block 4", start: "12:41", end: "13:48" },
                { name: "Block 5", start: "13:53", end: "15:00" }
            ],
            partial: [
                { name: "Block 1", start: "8:24", end: "9:14" },
                { name: "Block 2", start: "9:19", end: "10:09" },
                { name: "Block 3", start: "10:14", end: "11:04" },
                { name: "Block 4", start: "11:09", end: "11:59" },
                { name: "Block 5", start: "12:04", end: "12:54" }
            ],
            delay: [
                { name: "Block 1", start: "9:54", end: "10:44" },
                { name: "Block 2", start: "10:49", end: "11:39" },
                { name: "Block 3", start: "11:44", end: "12:34" },
                { name: "Lunch", start: "12:39", end: "13:09" },
                { name: "Block 4", start: "13:15", end: "14:05" },
                { name: "Block 5", start: "14:10", end: "15:00" }
            ],
            evacuation: [
                { name: "Block 1", start: "8:24", end: "10:04" },
                { name: "Block 2", start: "10:09", end: "11:08" },
                { name: "Block 3", start: "11:13", end: "12:12" },
                { name: "Lunch", start: "12:17", end: "12:52" },
                { name: "Block 4", start: "12:57", end: "13:56" },
                { name: "Block 5", start: "14:01", end: "15:00" }
            ]
        };

        const rotation = {
            A: [1, 2, 3, 5, 6],
            B: [4, 1, 2, 7, 5],
            C: [3, 4, 1, 6, 7],
            D: [2, 3, 4, 5, 6],
            E: [1, 2, 3, 7, 5],
            F: [4, 1, 2, 6, 7],
            G: [3, 4, 7, 5, 6]
        };

        const storageKey = "classTimerData.v2";
        const legacyStorageKey = "classTimerProfiles.v1";
        const defaultSettings = {
            theme: "light",
            layout: "balanced",
            accentColor: "",
            backgroundImage: "",
            autoRotationEnabled: false,
            rotationStartDay: "A",
            rotationStartDate: "",
            fontSize: "normal",
            reducedMotion: false
        };
        const fallbackData = {
            profiles: [{ id: "me", name: "Me", classes: { "1": "", "2": "", "3": "", "4": "", "5": "", "6": "", "7": "" } }],
            activeProfileId: "me",
            settings: defaultSettings
        };

        function getBundledData() {
            const candidate = window.CLASS_TIMER_DATA;
            if (!candidate || !Array.isArray(candidate.profiles)) return fallbackData;
            try {
                return { ...candidate, profiles: normalizeProfiles(candidate.profiles) };
            } catch {
                return fallbackData;
            }
        }

        const bundledData = getBundledData();
        const dataFileMissing = bundledData === fallbackData;
        const dataSourceSignature = JSON.stringify(bundledData);
        const themeNames = ["light", "dark", "lavender", "forest", "ocean", "sunset", "midnight"];
        const layoutNames = ["balanced", "timer-focus", "schedule-focus", "stacked"];
        const ui = {
            schedule: document.getElementById("schedule"),
            day: document.getElementById("day"),
            profileOptions: document.getElementById("profileOptions"),
            profileButton: document.getElementById("profileButton"),
            profileDropdown: document.getElementById("profileDropdown"),
            profileTitle: document.getElementById("profileTitle"),
            classList: document.getElementById("classList"),
            notice: document.getElementById("notice"),
            profileDialog: document.getElementById("profileDialog"),
            profileForm: document.getElementById("profileForm"),
            profileNameInput: document.getElementById("profileNameInput"),
            classEditor: document.getElementById("classEditor"),
            dialogTitle: document.getElementById("dialogTitle"),
            dialogError: document.getElementById("dialogError"),
            settingsButton: document.getElementById("settingsButton"),
            settingsDialog: document.getElementById("settingsDialog"),
            settingsForm: document.getElementById("settingsForm"),
            themeSelect: document.getElementById("themeSelect"),
            layoutSelect: document.getElementById("layoutSelect"),
            accentColor: document.getElementById("accentColor"),
            customAccentEnabled: document.getElementById("customAccentEnabled"),
            backgroundImage: document.getElementById("backgroundImage"),
            backgroundName: document.getElementById("backgroundName"),
            settingsError: document.getElementById("settingsError"),
            autoRotationEnabled: document.getElementById("autoRotationEnabled"),
            rotationSettings: document.getElementById("rotationSettings"),
            rotationStartDay: document.getElementById("rotationStartDay"),
            rotationStartDate: document.getElementById("rotationStartDate"),
            fontSizeSelect: document.getElementById("fontSizeSelect"),
            reducedMotionEnabled: document.getElementById("reducedMotionEnabled"),
            shortcutsDialog: document.getElementById("shortcutsDialog")
        };

        let persistedState = readPersistedState();
        // Local user data must survive changes to the public starter data.js file.
        const persistedStateApplies = Boolean(persistedState && (
            persistedState.legacyMigration || Array.isArray(persistedState.profiles)
        ));
        let profiles = loadProfiles(persistedStateApplies ? persistedState : null);
        let appSettings = normalizeSettings(
            persistedStateApplies && persistedState.settings
                ? persistedState.settings
                : bundledData.settings
        );
        let activeProfileId = persistedStateApplies && persistedState.activeProfileId
            ? persistedState.activeProfileId
            : bundledData.activeProfileId || "me";
        const configuredManualDay = persistedStateApplies && persistedState.manualRotationDay
            ? persistedState.manualRotationDay
            : bundledData.manualRotationDay;
        let manualRotationDay = rotation[configuredManualDay] ? configuredManualDay : "A";
        let pendingBackgroundImage = appSettings.backgroundImage;
        let settingsBeforeEdit = null;
        let cloudUpdatedAt = persistedState && persistedState.cloudUpdatedAt ? persistedState.cloudUpdatedAt : null;
        let cloudDirty = Boolean(persistedState && persistedState.cloudDirty);
        let supabaseClient = null;
        let authUser = null;
        let cloudSyncTimer = null;
        let suppressCloudSync = false;

        function readPersistedState() {
            try {
                const current = localStorage.getItem(storageKey);
                if (current) return JSON.parse(current);
                const legacy = localStorage.getItem(legacyStorageKey);
                return legacy ? { profiles: JSON.parse(legacy), legacyMigration: true } : null;
            } catch (error) {
                showNotice("Saved settings could not be read. The defaults from data.js are being used.");
                return null;
            }
        }

        function loadProfiles(state) {
            const source = state && state.profiles ? state.profiles : bundledData.profiles;
            try {
                return normalizeProfiles(source);
            } catch (error) {
                showNotice(`Profiles could not be loaded: ${error.message} Using data.js defaults instead.`);
                return normalizeProfiles(bundledData.profiles);
            }
        }

        function normalizeProfiles(input) {
            const list = Array.isArray(input) ? input : input && input.profiles;
            if (!Array.isArray(list) || list.length === 0) {
                throw new Error("The JSON must contain a non-empty profiles array.");
            }

            const ids = new Set();
            return list.map((profile) => {
                if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
                    throw new Error("Every profile must be an object.");
                }
                const name = typeof profile.name === "string" ? profile.name.trim() : "";
                const id = typeof profile.id === "string" && profile.id.trim()
                    ? profile.id.trim()
                    : makeProfileId(name);
                if (!name || !id) throw new Error("Each profile needs a name.");
                if (ids.has(id)) throw new Error("Profile IDs must be unique within the JSON file.");
                if (!profile.classes || typeof profile.classes !== "object" || Array.isArray(profile.classes)) {
                    throw new Error("Each profile needs a classes object mapping periods 1–7 to class names.");
                }

                const classes = {};
                for (let period = 1; period <= 7; period += 1) {
                    const className = profile.classes[String(period)];
                    if (className !== undefined && typeof className !== "string") {
                        throw new Error("Class names must be text.");
                    }
                    classes[String(period)] = className ? className.trim() : "";
                }
                ids.add(id);
                return { id, name, classes };
            });
        }

        function normalizeSettings(input) {
            const settings = input && typeof input === "object" ? input : {};
            const accentColor = typeof settings.accentColor === "string" && /^#[\da-f]{6}$/i.test(settings.accentColor)
                ? settings.accentColor
                : "";
            const backgroundImage = typeof settings.backgroundImage === "string"
                && settings.backgroundImage.length <= 2100000
                && /^data:image\/(?:png|jpeg|webp|gif);base64,[\da-z+/]+=*$/i.test(settings.backgroundImage)
                ? settings.backgroundImage
                : "";
            const rotationStartDate = isValidDateString(settings.rotationStartDate)
                ? settings.rotationStartDate
                : "";
            const fontSizes = ["normal", "large", "compact"];
            const result = {
                theme: themeNames.includes(settings.theme) ? settings.theme : defaultSettings.theme,
                layout: layoutNames.includes(settings.layout) ? settings.layout : defaultSettings.layout,
                accentColor,
                backgroundImage,
                autoRotationEnabled: settings.autoRotationEnabled === true,
                rotationStartDay: rotation[settings.rotationStartDay] ? settings.rotationStartDay : "A",
                rotationStartDate,
                fontSize: fontSizes.includes(settings.fontSize) ? settings.fontSize : defaultSettings.fontSize,
                reducedMotion: settings.reducedMotion === true
            };
            if (result.autoRotationEnabled && !result.rotationStartDate) {
                result.rotationStartDate = getLocalDateString(new Date());
            }
            return result;
        }

        function isValidDateString(value) {
            if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
            const date = new Date(`${value}T00:00:00Z`);
            return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
        }

        function makeProfileId(name) {
            return name.toLowerCase()
                .normalize("NFKD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
        }

        function saveData() {
            try {
                if (!suppressCloudSync) cloudDirty = true;
                persistedState = {
                    profiles,
                    activeProfileId,
                    manualRotationDay,
                    settings: appSettings,
                    dataSourceSignature,
                    cloudUpdatedAt,
                    cloudDirty
                };
                localStorage.setItem(storageKey, JSON.stringify(persistedState));
                if (!suppressCloudSync) scheduleCloudSync();
                return true;
            } catch (error) {
                showNotice("Changes could not be saved in this browser. Download data.js to keep a copy.");
                return false;
            }
        }

        const accountUI = {
            dialog: document.getElementById("accountDialog"),
            form: document.getElementById("accountForm"),
            email: document.getElementById("accountEmail"),
            password: document.getElementById("accountPassword"),
            signedOut: document.getElementById("accountSignedOut"),
            signedIn: document.getElementById("accountSignedIn"),
            userEmail: document.getElementById("accountUserEmail"),
            error: document.getElementById("accountError"),
            help: document.getElementById("accountHelp"),
            description: document.getElementById("accountDescription"),
            button: document.getElementById("syncButton"),
            buttonLabel: document.getElementById("syncButtonLabel")
        };

        function setCloudStatus(state, label) {
            accountUI.button.dataset.state = state;
            accountUI.buttonLabel.textContent = label;
        }

        function showAccountError(message) {
            accountUI.error.textContent = message;
            accountUI.error.classList.add("visible");
        }

        function clearAccountError() {
            accountUI.error.textContent = "";
            accountUI.error.classList.remove("visible");
        }

        function updateAccountUI() {
            const signedIn = Boolean(authUser);
            accountUI.signedOut.hidden = signedIn;
            accountUI.signedIn.hidden = !signedIn;
            accountUI.userEmail.textContent = authUser ? authUser.email : "";
            if (signedIn) {
                setCloudStatus("connected", "Cloud connected");
                accountUI.description.textContent = "Your profiles and settings sync to your private account. This browser also keeps a local copy for offline use.";
            } else if (supabaseClient) {
                setCloudStatus("", "Local only");
                accountUI.description.textContent = "Sign in to sync your profiles and settings across devices. The timer always works locally without an account.";
            }
        }

        function currentDataSnapshot() {
            return {
                profiles,
                activeProfileId,
                manualRotationDay,
                settings: appSettings
            };
        }

        function scheduleCloudSync() {
            if (!supabaseClient || !authUser || suppressCloudSync) return;
            if (cloudSyncTimer) window.clearTimeout(cloudSyncTimer);
            setCloudStatus("syncing", "Saving…");
            cloudSyncTimer = window.setTimeout(() => {
                cloudSyncTimer = null;
                syncCloudData();
            }, 900);
        }

        async function syncCloudData() {
            if (!supabaseClient || !authUser) return;
            setCloudStatus("syncing", "Saving…");
            try {
                const { data, error } = await supabaseClient
                    .from("user_data")
                    .upsert({ user_id: authUser.id, data: currentDataSnapshot() }, { onConflict: "user_id" })
                    .select("updated_at")
                    .single();
                if (error) throw error;
                cloudUpdatedAt = data.updated_at;
                cloudDirty = false;
                suppressCloudSync = true;
                saveData();
                suppressCloudSync = false;
                setCloudStatus("connected", "Cloud connected");
            } catch (error) {
                suppressCloudSync = false;
                setCloudStatus("error", "Sync issue");
                showNotice(`Cloud sync failed: ${error.message} Your changes are still saved in this browser.`);
            }
        }

        function applyCloudSnapshot(snapshot, updatedAt) {
            if (!snapshot || !Array.isArray(snapshot.profiles)) {
                throw new Error("The cloud backup has an unexpected format.");
            }
            profiles = normalizeProfiles(snapshot.profiles);
            activeProfileId = profiles.some((profile) => profile.id === snapshot.activeProfileId)
                ? snapshot.activeProfileId
                : profiles[0].id;
            manualRotationDay = rotation[snapshot.manualRotationDay] ? snapshot.manualRotationDay : "A";
            appSettings = normalizeSettings(snapshot.settings || {});
            cloudUpdatedAt = updatedAt || null;
            cloudDirty = false;
            suppressCloudSync = true;
            saveData();
            suppressCloudSync = false;
            applySettings();
            renderProfileOptions();
            update();
        }

        async function loadCloudData() {
            if (!supabaseClient || !authUser) return;
            setCloudStatus("syncing", "Checking…");
            let row;
            try {
                const result = await supabaseClient
                    .from("user_data")
                    .select("data, updated_at")
                    .eq("user_id", authUser.id)
                    .maybeSingle();
                if (result.error) throw result.error;
                row = result.data;
            } catch (error) {
                setCloudStatus("error", "Sync issue");
                showNotice(`Could not load cloud data: ${error.message}. Your local profiles are unchanged.`);
                return;
            }
            if (!row) {
                await syncCloudData();
                showNotice("Cloud sync is ready. Your existing local profiles have been backed up to your account.");
                return;
            }

            if (!cloudDirty && cloudUpdatedAt && cloudUpdatedAt === row.updated_at) {
                setCloudStatus("connected", "Cloud connected");
                return;
            }

            const hasLocalData = Boolean(persistedState && Array.isArray(persistedState.profiles));
            if (hasLocalData) {
                const useCloud = window.confirm(
                    "We found saved data in your cloud account.\n\nOK: load the cloud copy onto this device.\nCancel: keep this device's current profiles and replace the cloud copy with them."
                );
                if (useCloud) {
                    try {
                        applyCloudSnapshot(row.data, row.updated_at);
                        showNotice("Cloud profiles and settings loaded onto this device.");
                    } catch (error) {
                        setCloudStatus("error", "Sync issue");
                        showNotice(`Cloud data could not be applied: ${error.message}`);
                    }
                } else {
                    await syncCloudData();
                    showNotice("This device's profiles were kept and uploaded to your cloud account.");
                }
            } else {
                try {
                    applyCloudSnapshot(row.data, row.updated_at);
                    showNotice("Your cloud profiles and settings are ready on this device.");
                } catch (error) {
                    setCloudStatus("error", "Sync issue");
                    showNotice(`Cloud data could not be applied: ${error.message}`);
                }
            }
        }

        async function initializeCloudSync() {
            const config = window.CLASS_TIMER_SUPABASE || {};
            if (!config.url || !config.anonKey || !window.supabase?.createClient) {
                setCloudStatus("", "Local only");
                return;
            }
            try {
                supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                supabaseClient.auth.onAuthStateChange((event, session) => {
                    authUser = session?.user || null;
                    updateAccountUI();
                    if (event === "SIGNED_IN") window.setTimeout(() => loadCloudData(), 0);
                    if (event === "SIGNED_OUT") {
                        cloudUpdatedAt = null;
                        setCloudStatus("", "Local only");
                    }
                });
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) throw error;
                authUser = data.session?.user || null;
                updateAccountUI();
                if (authUser) await loadCloudData();
            } catch (error) {
                setCloudStatus("error", "Cloud unavailable");
                showNotice(`Cloud sync could not start: ${error.message}. Local mode is still available.`);
            }
        }

        async function signIn() {
            clearAccountError();
            const email = accountUI.email.value.trim();
            const password = accountUI.password.value;
            if (!email || !password) return showAccountError("Enter your email address and password.");
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) showAccountError(error.message);
            else {
                accountUI.dialog.close();
                accountUI.password.value = "";
            }
        }

        async function signUp() {
            clearAccountError();
            const email = accountUI.email.value.trim();
            const password = accountUI.password.value;
            if (!email || !password) return showAccountError("Enter your email address and choose a password.");
            if (password.length < 8) return showAccountError("Use a password with at least 8 characters.");
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.href.split("#")[0].split("?")[0] }
            });
            if (error) showAccountError(error.message);
            else if (!data.session) {
                accountUI.password.value = "";
                showAccountError("Check your email for a confirmation link. Once you confirm, return here and sign in.");
            } else {
                accountUI.dialog.close();
                accountUI.password.value = "";
            }
        }

        window.addEventListener("online", () => {
            if (authUser && cloudDirty) scheduleCloudSync();
        });

        function openAccountDialog() {
            clearAccountError();
            if (!supabaseClient) {
                showAccountError("Cloud sync needs a Supabase project first. Add your Project URL and anon/public key to supabase-config.js, then run the SQL setup file in Supabase.");
            }
            updateAccountUI();
            accountUI.dialog.showModal();
        }

        function showNotice(message) {
            ui.notice.textContent = message;
            ui.notice.classList.add("visible");
        }

        function clearNotice() {
            ui.notice.textContent = "";
            ui.notice.classList.remove("visible");
        }

        function applySettings() {
            applyAppearance(appSettings);
            ui.autoRotationEnabled.checked = appSettings.autoRotationEnabled;
            ui.rotationSettings.hidden = !appSettings.autoRotationEnabled;
            ui.rotationStartDay.value = appSettings.rotationStartDay;
            ui.rotationStartDate.value = appSettings.rotationStartDate || getLocalDateString(new Date());
            ui.fontSizeSelect.value = appSettings.fontSize;
            ui.reducedMotionEnabled.checked = appSettings.reducedMotion;
            updateRotationControls();
        }

        function applyAppearance(settings) {
            document.documentElement.dataset.theme = settings.theme;
            document.querySelector(".dashboard-content").dataset.layout = settings.layout;
            document.documentElement.dataset.fontSize = settings.fontSize;
            document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
            if (settings.accentColor) {
                document.documentElement.style.setProperty("--blue", settings.accentColor);
                document.documentElement.style.setProperty("--blue-dark", settings.accentColor);
            } else {
                document.documentElement.style.removeProperty("--blue");
                document.documentElement.style.removeProperty("--blue-dark");
            }
            document.body.style.setProperty(
                "--user-background",
                settings.backgroundImage ? `url("${settings.backgroundImage}")` : "none"
            );
        }

        function previewSettings() {
            applyAppearance({
                ...appSettings,
                theme: ui.themeSelect.value,
                layout: ui.layoutSelect.value,
                accentColor: ui.customAccentEnabled.checked ? ui.accentColor.value : "",
                backgroundImage: pendingBackgroundImage,
                fontSize: ui.fontSizeSelect.value,
                reducedMotion: ui.reducedMotionEnabled.checked
            });
        }

        function getLocalDateString(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }

        function getAutomaticRotationDay(now) {
            if (!appSettings.autoRotationEnabled) return manualRotationDay;
            const anchorDate = appSettings.rotationStartDate || getLocalDateString(now);
            const [anchorYear, anchorMonth, anchorDay] = anchorDate.split("-").map(Number);
            const [todayYear, todayMonth, todayDay] = getLocalDateString(now).split("-").map(Number);
            const anchor = Date.UTC(anchorYear, anchorMonth - 1, anchorDay);
            const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
            const direction = today >= anchor ? 1 : -1;
            const daysPassed = Math.abs(today - anchor) / 86400000;
            let weekdaysPassed = Math.floor(daysPassed / 7) * 5;
            for (let offset = 1; offset <= daysPassed % 7; offset += 1) {
                const steppedDate = new Date(anchor + direction * offset * 86400000);
                const weekday = steppedDate.getUTCDay();
                if (weekday !== 0 && weekday !== 6) weekdaysPassed += 1;
            }
            weekdaysPassed *= direction;
            const anchorIndex = "ABCDEFG".indexOf(appSettings.rotationStartDay);
            const rotationIndex = ((anchorIndex + weekdaysPassed) % 7 + 7) % 7;
            return "ABCDEFG"[rotationIndex];
        }

        function updateRotationControls() {
            const day = getAutomaticRotationDay(new Date());
            ui.day.value = day;
            ui.day.disabled = appSettings.autoRotationEnabled;
            const note = document.getElementById("rotationNote");
            note.hidden = !appSettings.autoRotationEnabled;
            if (appSettings.autoRotationEnabled) {
                const anchorDate = appSettings.rotationStartDate || getLocalDateString(new Date());
                const formattedDate = new Date(`${anchorDate}T00:00:00`).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
                note.textContent = `Auto rotation · ${day} Day today · counting weekdays from ${appSettings.rotationStartDay} Day on ${formattedDate}`;
            }
        }

        function selectedProfile() {
            return profiles.find((profile) => profile.id === activeProfileId) || profiles[0];
        }

        function renderProfileOptions() {
            if (!profiles.some((profile) => profile.id === activeProfileId)) {
                activeProfileId = profiles[0].id;
            }
            ui.profileOptions.replaceChildren();
            profiles.forEach((profile) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `menu-profile${profile.id === activeProfileId ? " selected" : ""}`;
                button.setAttribute("role", "menuitem");
                button.setAttribute("aria-current", profile.id === activeProfileId ? "true" : "false");
                button.textContent = profile.name;
                if (profile.id === activeProfileId) {
                    const check = document.createElement("span");
                    check.className = "menu-check";
                    check.textContent = "✓";
                    button.appendChild(check);
                }
                button.addEventListener("click", () => {
                    activeProfileId = profile.id;
                    closeProfileMenu();
                    clearNotice();
                    renderProfileOptions();
                    update();
                    saveData();
                });
                ui.profileOptions.appendChild(button);
            });
            const profile = selectedProfile();
            document.getElementById("profileButtonName").textContent = profile.name;
            document.getElementById("profileAvatar").textContent = profile.name.charAt(0).toUpperCase();
            ui.profileTitle.textContent = profile.name;
        }

        function getTime(time) {
            const [hour, minute] = time.split(":").map(Number);
            const date = new Date();
            date.setHours(hour, minute, 0, 0);
            return date;
        }

        function formatTime(time) {
            const [hourValue, minute] = time.split(":").map(Number);
            const suffix = hourValue >= 12 ? "PM" : "AM";
            const hour = hourValue % 12 || 12;
            return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
        }

        function blockNumberAt(schedule, scheduleIndex) {
            let blockNumber = 0;
            for (let index = 0; index <= scheduleIndex; index += 1) {
                if (schedule[index].name !== "Lunch") blockNumber += 1;
            }
            return schedule[scheduleIndex].name === "Lunch" ? null : blockNumber;
        }

        function periodAt(schedule, scheduleIndex, day) {
            if (schedule[scheduleIndex].name === "Lunch") return "Lunch";
            const blockNumber = blockNumberAt(schedule, scheduleIndex);
            return `Period ${rotation[day][blockNumber - 1]}`;
        }

        function getSchedulePosition(now, schedule) {
            for (let index = 0; index < schedule.length; index += 1) {
                const start = getTime(schedule[index].start);
                const end = getTime(schedule[index].end);
                if (now >= start && now < end) return { currentIndex: index, nextIndex: index + 1 };
                if (now < start) return { currentIndex: -1, nextIndex: index };
            }
            return { currentIndex: -1, nextIndex: -1 };
        }

        function classNameFor(profile, periodLabel) {
            if (!periodLabel) return "";
            if (periodLabel === "Lunch") return "Lunch";
            const period = periodLabel.replace("Period ", "");
            return profile.classes[period] || "No class name set";
        }

        function renderClassList(profile, day, schedule, position) {
            ui.classList.replaceChildren();
            if (schedule.length === 0) {
                const empty = document.createElement("li");
                empty.className = "empty-schedule";
                empty.textContent = "No class blocks in this schedule.";
                ui.classList.appendChild(empty);
                return;
            }

            let blockNumber = 0;
            schedule.forEach((item, index) => {
                const listItem = document.createElement("li");
                if (position.currentIndex === index) listItem.classList.add("active");
                else if (position.currentIndex === -1 && position.nextIndex === index) listItem.classList.add("upcoming");

                const className = document.createElement("span");
                className.className = "class-name";
                let metaText = `${formatTime(item.start)}–${formatTime(item.end)}`;
                if (item.name === "Lunch") {
                    className.textContent = "Lunch";
                } else {
                    blockNumber += 1;
                    const periodNumber = rotation[day][blockNumber - 1];
                    className.textContent = profile.classes[String(periodNumber)] || "No class name set";
                    metaText = `${item.name} · Period ${periodNumber} · ${metaText}`;
                }

                const meta = document.createElement("span");
                meta.className = "class-meta";
                meta.textContent = metaText;

                listItem.append(className, meta);
                ui.classList.appendChild(listItem);
            });
        }

        function update() {
            const now = new Date();
            const schedule = schedules[ui.schedule.value];
            const day = getAutomaticRotationDay(now);
            ui.day.value = day;
            ui.day.disabled = appSettings.autoRotationEnabled;
            updateRotationControls();
            const profile = selectedProfile();
            const position = getSchedulePosition(now, schedule);
            const current = position.currentIndex >= 0 ? schedule[position.currentIndex] : null;
            const next = position.nextIndex >= 0 ? schedule[position.nextIndex] : null;

            document.getElementById("clock").textContent = now.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit"
            });
            document.getElementById("clock").dateTime = now.toISOString();

            const currentPeriod = current ? periodAt(schedule, position.currentIndex, day) : null;
            const nextPeriod = next ? periodAt(schedule, position.nextIndex, day) : null;
            const progressWrap = document.getElementById("progressWrap");
            if (current) {
                const startTime = getTime(current.start).getTime();
                const endTime = getTime(current.end).getTime();
                const progress = Math.min(100, Math.max(0, ((now.getTime() - startTime) / (endTime - startTime)) * 100));
                const progressRounded = Math.floor(progress);
                progressWrap.hidden = false;
                document.getElementById("progressCaption").textContent = `${current.name} progress`;
                document.getElementById("progressPercent").textContent = window.CLASS_TIMER_DATA?.showPercentage ? `${progressRounded}%` : "";
                document.getElementById("progressTrack").setAttribute("aria-label", `${current.name} progress`);
                document.getElementById("progressTrack").setAttribute("aria-valuenow", String(progressRounded));
                document.getElementById("progressFill").style.width = `${progress}%`;
            } else {
                progressWrap.hidden = true;
            }
            document.getElementById("yourCurrent").textContent = current
                ? classNameFor(profile, currentPeriod)
                : "Not in class";
            document.getElementById("yourNext").textContent = next
                ? classNameFor(profile, nextPeriod)
                : "No more classes today";

            if (current) {
                const secondsLeft = Math.max(0, Math.floor((getTime(current.end) - now) / 1000));
                const minutes = Math.floor(secondsLeft / 60);
                const seconds = secondsLeft % 60;
                document.getElementById("statusPill").textContent = current.name === "Lunch" ? "LUNCH" : "IN CLASS";
                document.getElementById("period").textContent = currentPeriod;
                document.getElementById("nextperiod").textContent = next
                    ? `Next: ${nextPeriod}`
                    : "No more classes";
                document.getElementById("timer").textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
                document.getElementById("message").textContent = `Time left in ${current.name}`;
            } else if (next) {
                document.getElementById("statusPill").textContent = "UP NEXT";
                document.getElementById("period").textContent = "Passing time";
                document.getElementById("nextperiod").textContent = nextPeriod;
                document.getElementById("timer").textContent = "--:--";
                document.getElementById("message").textContent = `Starts at ${formatTime(next.start)}`;
            } else {
                document.getElementById("statusPill").textContent = "SCHOOL’S OUT";
                document.getElementById("period").textContent = "School is over";
                document.getElementById("nextperiod").textContent = "";
                document.getElementById("timer").textContent = "Done";
                document.getElementById("message").textContent = "Have a good afternoon!";
            }

            ui.profileTitle.textContent = profile.name;
            renderClassList(profile, day, schedule, position);
        }

        function closeProfileMenu() {
            ui.profileDropdown.hidden = true;
            ui.profileButton.setAttribute("aria-expanded", "false");
        }

        function openProfileEditor(profile) {
            closeProfileMenu();
            clearNotice();
            ui.profileForm.dataset.mode = profile ? "edit" : "create";
            ui.profileForm.dataset.profileId = profile ? profile.id : "";
            ui.dialogTitle.textContent = profile ? `Edit ${profile.name}` : "Create profile";
            document.getElementById("saveProfileButton").textContent = profile ? "Save changes" : "Create profile";
            ui.profileNameInput.value = profile ? profile.name : "";
            ui.classEditor.replaceChildren();
            for (let period = 1; period <= 7; period += 1) {
                const row = document.createElement("div");
                row.className = "class-editor-row";
                const label = document.createElement("label");
                label.htmlFor = `classPeriod${period}`;
                label.textContent = `Period ${period}`;
                const input = document.createElement("input");
                input.id = `classPeriod${period}`;
                input.name = `class${period}`;
                input.type = "text";
                input.maxLength = 100;
                input.autocomplete = "off";
                input.placeholder = "Class name (optional)";
                input.value = profile ? profile.classes[String(period)] || "" : "";
                row.append(label, input);
                ui.classEditor.appendChild(row);
            }
            ui.dialogError.textContent = "";
            ui.dialogError.classList.remove("visible");
            ui.profileDialog.showModal();
            ui.profileNameInput.focus();
        }

        function uniqueProfileId(name) {
            const baseId = makeProfileId(name) || "profile";
            let id = baseId;
            let suffix = 2;
            while (profiles.some((profile) => profile.id === id)) {
                id = `${baseId}-${suffix}`;
                suffix += 1;
            }
            return id;
        }

        function saveEditedProfile(event) {
            event.preventDefault();
            const name = ui.profileNameInput.value.trim();
            if (!name) {
                ui.dialogError.textContent = "Enter a name for this profile.";
                ui.dialogError.classList.add("visible");
                ui.profileNameInput.focus();
                return;
            }

            const mode = ui.profileForm.dataset.mode;
            const oldId = ui.profileForm.dataset.profileId;
            const classes = {};
            for (let period = 1; period <= 7; period += 1) {
                classes[String(period)] = document.getElementById(`classPeriod${period}`).value.trim();
            }

            if (mode === "edit") {
                const profile = profiles.find((item) => item.id === oldId);
                if (!profile) {
                    ui.dialogError.textContent = "That profile is no longer available. Close this window and try again.";
                    ui.dialogError.classList.add("visible");
                    return;
                }
                profile.name = name;
                profile.classes = classes;
            } else {
                const id = uniqueProfileId(name);
                profiles.push({ id, name, classes });
                activeProfileId = id;
            }

            const saved = saveData();
            ui.profileDialog.close();
            renderProfileOptions();
            update();
            if (saved) {
                showNotice(`“${name}” ${mode === "edit" ? "updated" : "created"} and saved in this browser.`);
            }
        }

        function mergeImportedProfiles(importedProfiles) {
            const merged = profiles.slice();
            importedProfiles.forEach((incoming) => {
                const existingIndex = merged.findIndex((profile) => profile.id === incoming.id);
                if (existingIndex >= 0) merged[existingIndex] = incoming;
                else merged.push(incoming);
            });
            profiles = merged;
        }

        async function importProfileFile(file) {
            clearNotice();
            try {
                const contents = await file.text();
                const trimmed = contents.trim();
                const dataText = trimmed.startsWith("{")
                    ? trimmed
                    : trimmed.replace(/^window\.CLASS_TIMER_DATA\s*=\s*/, "").replace(/;\s*$/, "");
                const parsed = JSON.parse(dataText);
                const imported = normalizeProfiles(parsed);
                mergeImportedProfiles(imported);
                if (parsed.settings) appSettings = normalizeSettings(parsed.settings);
                if (rotation[parsed.manualRotationDay]) manualRotationDay = parsed.manualRotationDay;
                if (parsed.activeProfileId && profiles.some((profile) => profile.id === parsed.activeProfileId)) {
                    activeProfileId = parsed.activeProfileId;
                }
                const saved = saveData();
                renderProfileOptions();
                applySettings();
                update();
                if (saved) {
                    showNotice(`Imported ${imported.length} profile${imported.length === 1 ? "" : "s"}${parsed.settings ? " and settings" : ""}, then saved them in this browser.`);
                }
            } catch (error) {
                showNotice(`Could not import that data file: ${error.message}`);
            }
        }

        function exportData() {
            clearNotice();
            const output = {
                profiles,
                activeProfileId,
                manualRotationDay,
                settings: appSettings
            };
            const source = `window.CLASS_TIMER_DATA = ${JSON.stringify(output, null, 2)};\n`;
            const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "data.js";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            showNotice("Downloaded data.js with your profiles and settings. Replace the old data.js beside this HTML to use it as the startup data.");
        }

        function openSettings() {
            closeProfileMenu();
            clearNotice();
            settingsBeforeEdit = { ...appSettings };
            pendingBackgroundImage = appSettings.backgroundImage;
            ui.themeSelect.value = appSettings.theme;
            ui.layoutSelect.value = appSettings.layout;
            ui.accentColor.value = appSettings.accentColor || "#4268e8";
            ui.customAccentEnabled.checked = Boolean(appSettings.accentColor);
            ui.accentColor.disabled = !ui.customAccentEnabled.checked;
            ui.autoRotationEnabled.checked = appSettings.autoRotationEnabled;
            ui.rotationSettings.hidden = !appSettings.autoRotationEnabled;
            ui.rotationStartDay.value = appSettings.rotationStartDay;
            ui.rotationStartDate.value = appSettings.rotationStartDate || getLocalDateString(new Date());
            ui.fontSizeSelect.value = appSettings.fontSize;
            ui.reducedMotionEnabled.checked = appSettings.reducedMotion;
            ui.backgroundName.textContent = pendingBackgroundImage
                ? "A background picture is saved"
                : "No picture selected";
            document.getElementById("clearBackgroundButton").disabled = !pendingBackgroundImage;
            ui.settingsError.textContent = "";
            ui.settingsError.classList.remove("visible");
            ui.settingsDialog.showModal();
        }

        function readBackgroundImage(file) {
            if (!file.type.startsWith("image/")) {
                throw new Error("Choose an image file.");
            }
            if (file.size > 1.5 * 1024 * 1024) {
                throw new Error("Choose an image smaller than 1.5 MB.");
            }
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => {
                    if (typeof reader.result !== "string" || !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(reader.result)) {
                        reject(new Error("That image format could not be saved."));
                        return;
                    }
                    resolve(reader.result);
                });
                reader.addEventListener("error", () => reject(new Error("The image could not be read.")));
                reader.readAsDataURL(file);
            });
        }

        async function chooseBackgroundImage(file) {
            try {
                pendingBackgroundImage = await readBackgroundImage(file);
                ui.backgroundName.textContent = file.name;
                ui.settingsError.textContent = "";
                ui.settingsError.classList.remove("visible");
                previewSettings();
            } catch (error) {
                ui.settingsError.textContent = error.message;
                ui.settingsError.classList.add("visible");
            }
        }

        function saveSettings(event) {
            event.preventDefault();
            appSettings = normalizeSettings({
                theme: ui.themeSelect.value,
                layout: ui.layoutSelect.value,
                accentColor: ui.customAccentEnabled.checked ? ui.accentColor.value : "",
                backgroundImage: pendingBackgroundImage,
                autoRotationEnabled: ui.autoRotationEnabled.checked,
                rotationStartDay: ui.rotationStartDay.value,
                rotationStartDate: ui.rotationStartDate.value || getLocalDateString(new Date()),
                fontSize: ui.fontSizeSelect.value,
                reducedMotion: ui.reducedMotionEnabled.checked
            });
            applySettings();
            update();
            const saved = saveData();
            ui.settingsDialog.close();
            settingsBeforeEdit = null;
            if (saved) showNotice("Appearance settings saved in this browser. Download data.js to keep a portable copy.");
        }

        function cancelSettingsPreview() {
            if (settingsBeforeEdit) {
                appSettings = settingsBeforeEdit;
                pendingBackgroundImage = appSettings.backgroundImage;
                applySettings();
                update();
                settingsBeforeEdit = null;
            }
        }

        function cycleValue(values, currentValue) {
            const index = values.indexOf(currentValue);
            return values[(index + 1 + values.length) % values.length];
        }

        function cycleTheme() {
            appSettings = { ...appSettings, theme: cycleValue(themeNames, appSettings.theme) };
            applySettings();
            saveData();
            if (ui.settingsDialog.open) ui.themeSelect.value = appSettings.theme;
            showNotice(`Theme: ${appSettings.theme}.`);
        }

        function cycleLayout() {
            appSettings = { ...appSettings, layout: cycleValue(layoutNames, appSettings.layout) };
            applySettings();
            saveData();
            if (ui.settingsDialog.open) ui.layoutSelect.value = appSettings.layout;
            showNotice(`Layout: ${appSettings.layout.replace("-", " ")}.`);
        }

        function cycleProfile() {
            const currentIndex = profiles.findIndex((profile) => profile.id === activeProfileId);
            activeProfileId = profiles[(currentIndex + 1) % profiles.length].id;
            renderProfileOptions();
            update();
            saveData();
            showNotice(`Profile: ${selectedProfile().name}.`);
        }

        function cycleManualDay() {
            manualRotationDay = cycleValue("ABCDEFG", manualRotationDay);
            ui.day.value = manualRotationDay;
            update();
            saveData();
            showNotice(`Rotation day: ${manualRotationDay} Day.`);
        }

        function isTextEntry(target) {
            return target instanceof HTMLElement
                && (target.isContentEditable || target.matches("input, textarea, select"));
        }

        ui.schedule.addEventListener("change", update);
        ui.profileButton.addEventListener("click", () => {
            const opening = ui.profileDropdown.hidden;
            ui.profileDropdown.hidden = !opening;
            ui.profileButton.setAttribute("aria-expanded", String(opening));
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".profile-menu")) closeProfileMenu();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeProfileMenu();
                if (ui.settingsDialog.open) {
                    event.preventDefault();
                    cancelSettingsPreview();
                    ui.settingsDialog.close();
                } else if (ui.shortcutsDialog.open) {
                    ui.shortcutsDialog.close();
                } else if (ui.profileDialog.open) {
                    ui.profileDialog.close();
                }
                return;
            }
            if (isTextEntry(event.target) || ui.profileDialog.open || ui.settingsDialog.open || ui.shortcutsDialog.open) return;
            if (event.key === "?" && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                ui.shortcutsDialog.showModal();
                return;
            }
            if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;

            switch (event.key.toLowerCase()) {
                case "s":
                    event.preventDefault();
                    openSettings();
                    break;
                case "t":
                    event.preventDefault();
                    cycleTheme();
                    break;
                case "l":
                    event.preventDefault();
                    cycleLayout();
                    break;
                case "p":
                    event.preventDefault();
                    cycleProfile();
                    break;
                case "d":
                    if (!appSettings.autoRotationEnabled) {
                        event.preventDefault();
                        cycleManualDay();
                    }
                    break;
                default:
                    break;
            }
        });

        document.getElementById("createProfileButton").addEventListener("click", () => openProfileEditor(null));
        document.getElementById("editProfileButton").addEventListener("click", () => openProfileEditor(selectedProfile()));
        document.getElementById("closeDialogButton").addEventListener("click", () => ui.profileDialog.close());
        document.getElementById("cancelDialogButton").addEventListener("click", () => ui.profileDialog.close());
        ui.profileForm.addEventListener("submit", saveEditedProfile);
        document.getElementById("importButton").addEventListener("click", () => {
            closeProfileMenu();
            document.getElementById("profileFile").click();
        });
        document.getElementById("profileFile").addEventListener("change", (event) => {
            const [file] = event.target.files;
            if (file) importProfileFile(file);
            event.target.value = "";
        });
        document.getElementById("exportButton").addEventListener("click", () => {
            closeProfileMenu();
            exportData();
        });
        accountUI.button.addEventListener("click", openAccountDialog);
        document.getElementById("closeAccountButton").addEventListener("click", () => accountUI.dialog.close());
        accountUI.form.addEventListener("submit", (event) => event.preventDefault());
        document.getElementById("signInButton").addEventListener("click", () => {
            if (supabaseClient) signIn();
            else showAccountError("Add your Supabase Project URL and anon/public key to supabase-config.js first.");
        });
        document.getElementById("signUpButton").addEventListener("click", () => {
            if (supabaseClient) signUp();
            else showAccountError("Add your Supabase Project URL and anon/public key to supabase-config.js first.");
        });
        document.getElementById("signOutButton").addEventListener("click", async () => {
            if (!supabaseClient) return;
            const { error } = await supabaseClient.auth.signOut();
            if (error) showAccountError(error.message);
            else {
                accountUI.dialog.close();
                showNotice("Signed out. Your local profiles remain available on this device.");
            }
        });
        ui.settingsButton.addEventListener("click", openSettings);
        document.getElementById("closeSettingsButton").addEventListener("click", () => {
            cancelSettingsPreview();
            ui.settingsDialog.close();
        });
        document.getElementById("cancelSettingsButton").addEventListener("click", () => {
            cancelSettingsPreview();
            ui.settingsDialog.close();
        });
        ui.settingsDialog.addEventListener("cancel", cancelSettingsPreview);
        ui.settingsForm.addEventListener("submit", saveSettings);
        ui.backgroundImage.addEventListener("change", (event) => {
            const [file] = event.target.files;
            if (file) chooseBackgroundImage(file);
            event.target.value = "";
        });

        for (const control of [ui.themeSelect, ui.layoutSelect, ui.accentColor, ui.fontSizeSelect, ui.reducedMotionEnabled]) {
            control.addEventListener("input", previewSettings);
            control.addEventListener("change", previewSettings);
        }
        ui.customAccentEnabled.addEventListener("change", () => {
            ui.accentColor.disabled = !ui.customAccentEnabled.checked;
            previewSettings();
        });
        ui.autoRotationEnabled.addEventListener("change", () => {
            ui.rotationSettings.hidden = !ui.autoRotationEnabled.checked;
        });
        document.getElementById("clearBackgroundButton").addEventListener("click", () => {
            pendingBackgroundImage = "";
            ui.backgroundName.textContent = "No picture selected";
            document.getElementById("clearBackgroundButton").disabled = true;
            ui.settingsError.textContent = "";
            ui.settingsError.classList.remove("visible");
            previewSettings();
        });
        document.getElementById("resetSettingsButton").addEventListener("click", () => {
            ui.themeSelect.value = defaultSettings.theme;
            ui.layoutSelect.value = defaultSettings.layout;
            ui.accentColor.value = "#4268e8";
            ui.customAccentEnabled.checked = false;
            ui.accentColor.disabled = true;
            ui.autoRotationEnabled.checked = false;
            ui.rotationSettings.hidden = true;
            ui.rotationStartDay.value = manualRotationDay;
            ui.rotationStartDate.value = getLocalDateString(new Date());
            ui.fontSizeSelect.value = defaultSettings.fontSize;
            ui.reducedMotionEnabled.checked = false;
            pendingBackgroundImage = "";
            ui.backgroundName.textContent = "No picture selected";
            document.getElementById("clearBackgroundButton").disabled = true;
            ui.settingsError.textContent = "";
            ui.settingsError.classList.remove("visible");
            previewSettings();
        });
        document.getElementById("closeShortcutsButton").addEventListener("click", () => ui.shortcutsDialog.close());
        document.getElementById("dismissShortcutsButton").addEventListener("click", () => ui.shortcutsDialog.close());
        document.getElementById("shortcutHint").addEventListener("click", () => ui.shortcutsDialog.showModal());
        ui.day.addEventListener("change", () => {
            if (appSettings.autoRotationEnabled) return;
            manualRotationDay = ui.day.value;
            update();
            saveData();
        });
        applySettings();
        renderProfileOptions();
        update();
        if (dataFileMissing) showNotice("Could not load a valid data.js file. Keep it beside this HTML or import a profiles file.");
        initializeCloudSync();
        window.setInterval(update, 1000);
