import SwiftUI

/// Preloaderul din Claude Design ("Loading"): gradient de accent pe tot
/// ecranul, textura-vortex din puncte (spirala phyllotaxis) si logoul
/// clientului DIRECT in centru (fara card). Animatia ruleaza O SINGURA DATA,
/// 1.5s: punctele vin transparente din exteriorul spiralei si se aseaza in
/// aranjamentul final, care ramane apoi static (cu transparenta lui).
struct SplashView: View {
    /// Cand devine `true` (user delogat, dupa ce s-a format vortexul) logoul
    /// URCA si formularul de login apare — exact ca in Claude Design
    /// (riseup + formin, 1s ease-in-out). Default `false` = doar splash.
    var showLogin: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startDate = Date()
    @State private var vortexDone = false
    @State private var logoShown = false
    @State private var logoPulsing = false

    // Login (afisat doar cand showLogin) — reutilizeaza logica din LoginView.
    @State private var viewModel = LoginViewModel()
    @State private var socialViewModel = SocialSignInViewModel()
    @State private var showPassword = false
    @State private var showForgotSheet = false

    private static let formationDuration = 2.5
    /// Cat de mult urca logoul cand apare formularul (design: translateY(-235px)).
    private static let logoLift: CGFloat = 185

    private var accent: Color { BrandingManager.shared.accentColor }

    var body: some View {
        ZStack {
            // Fundal: aproape negru + gradient de accent care se pierde in jos.
            Color(red: 0.051, green: 0.051, blue: 0.059)
                .ignoresSafeArea()
            LinearGradient(
                colors: [accent.opacity(0.92), accent.opacity(0.7), accent.opacity(0.25)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // Vortexul de puncte. TimelineView se opreste singur dupa formare.
            TimelineView(.animation(minimumInterval: nil, paused: vortexDone)) { context in
                Canvas { ctx, size in
                    let elapsed = context.date.timeIntervalSince(startDate)
                    let t = reduceMotion
                        ? 1
                        : min(max(elapsed / Self.formationDuration, 0), 1)
                    Self.drawVortex(ctx, size: size, progress: t)
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)

            // Halou moale in jurul logoului — inmoaie trecerea dintre golul
            // vortexului si logo (fara margine dura). RAMANE fix pe vortex (helix):
            // cand apare loginul urca DOAR logoul, gloul sta pe centrul spiralei.
            RadialGradient(
                colors: [
                    Color.white.opacity(0.16),
                    Color.white.opacity(0.05),
                    .clear,
                ],
                center: .center,
                startRadius: 20,
                endRadius: 175
            )
            .blendMode(.plusLighter)
            .allowsHitTesting(false)

            // Logoul clientului, direct pe fundal — apare ca in design:
            // fade pe opacitate (ease-in-out), apoi pulseaza continuu
            // (2.2s ease-in-out, scale 1 ↔ 1.07). Cand apare loginul, URCA.
            logoView
                .opacity(logoShown ? 1 : 0)
                .scaleEffect(logoPulsing && !reduceMotion ? 1.07 : 1)
                .animation(
                    reduceMotion
                        ? nil
                        : .easeInOut(duration: 1.1).repeatForever(autoreverses: true),
                    value: logoPulsing
                )
                .offset(y: showLogin ? -Self.logoLift : 0)
                .animation(.easeInOut(duration: 1), value: showLogin)

            // Formularul de login — apare (fade-in) sub logoul urcat.
            loginForm
                .opacity(showLogin ? 1 : 0)
                .allowsHitTesting(showLogin)
                .animation(.easeInOut(duration: 1), value: showLogin)

            VStack(spacing: 2) {
                Text(AppConfig.brandName)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
                Text("Toata productia ta intr-un loc organizat")
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(.white.opacity(0.6))
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, 34)
            // Cand apare formularul, tagline-ul de jos se estompeaza (sa nu
            // se bata cap in cap cu butonul de autentificare).
            .opacity(showLogin ? 0 : 1)
            .animation(.easeInOut(duration: 0.6), value: showLogin)
        }
        .sheet(isPresented: $showForgotSheet) { ForgotPasswordSheet() }
        .onAppear {
            startDate = Date()
            withAnimation(.easeInOut(duration: 0.7).delay(0.15)) { logoShown = true }
            logoPulsing = true
        }
        .task {
            try? await Task.sleep(for: .seconds(Self.formationDuration + 0.1))
            vortexDone = true
        }
    }

    // MARK: - Login form (design "splash-form")

    @ViewBuilder
    private var loginForm: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            TextField("", text: $viewModel.email, prompt:
                Text("Email").foregroundStyle(.white.opacity(0.5)))
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .foregroundStyle(.white)
                .tint(.white)
                .padding()
                .background(fieldBackground)

            HStack {
                Group {
                    if showPassword {
                        TextField("", text: $viewModel.password, prompt:
                            Text("Parola").foregroundStyle(.white.opacity(0.5)))
                    } else {
                        SecureField("", text: $viewModel.password, prompt:
                            Text("Parola").foregroundStyle(.white.opacity(0.5)))
                    }
                }
                .textContentType(.password)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .foregroundStyle(.white)
                .tint(.white)

                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash" : "eye")
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding()
            .background(fieldBackground)

            Button("Ai uitat parola?") { showForgotSheet = true }
                .font(.subheadline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .trailing)

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await viewModel.login() }
            } label: {
                Group {
                    if viewModel.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Autentificare").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(viewModel.isFormValid ? accent : Color.white.opacity(0.25))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
            }
            .disabled(!viewModel.isFormValid || viewModel.isLoading)

            // Sign in with Apple (native) + Google. Forced dark scheme so the
            // Apple button is white + labels stay readable on the dark splash.
            SocialSignInButtons(viewModel: socialViewModel)
                .environment(\.colorScheme, .dark)
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
        // Sub logoul urcat: putin sub centru.
        .padding(.top, 120)
        .frame(maxWidth: 400)
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md)
            .fill(Color.black.opacity(0.35))
    }

    /// Logoul orgului afisat DIRECT (dark → light). Fara logo de org
    /// (apex / niciodata logat) afiseaza wordmark-ul "Horae.ca" ca sa nu
    /// ramana centrul gol.
    @ViewBuilder
    private var logoView: some View {
        if let logo = BrandingManager.shared.logo(for: .dark)
            ?? BrandingManager.shared.logo(for: .light) {
            logo
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 280, maxHeight: 120)
        } else {
            HoraeWordmark(size: 52)
                .environment(\.colorScheme, .dark)
        }
    }

    // MARK: - Vortex

    /// Punct din spirala: pozitia/opacitatea FINALA + jitterul lui de animatie.
    private struct Dot {
        let radius: CGFloat
        let angle: CGFloat
        let size: CGFloat
        let alpha: CGFloat
        /// 0..0.4 — decalajul de pornire, ca punctele sa nu vina la unison.
        let delay: Double
    }

    /// Textura din design: BRATE de spirala din puncte marunte — dense,
    /// curbate puternic, gol in centru pentru logo, tot mai transparente si
    /// mai rarefiate spre exterior. Deterministic (fara Math.random).
    private static let dots: [Dot] = {
        let arms = 32
        let innerRadius = 88.0
        let outerRadius = 230.0 // compact, ca in design (~latimea ecranului)
        let step = 3.6 // puncte apropiate → bratul se citeste ca o LINIE
        let twist = 0.0135 // rad per pt — curbura bratului
        var result: [Dot] = []
        result.reserveCapacity(arms * 64)
        for arm in 0..<arms {
            let baseAngle = Double(arm) / Double(arms) * 2 * .pi
            var r = innerRadius
            var j = 0
            while r <= outerRadius {
                let fi = Double(arm * 97 + j)
                let h1 = abs(sin(fi * 12.9898 + 78.233)) // pseudo-random stabil
                let h2 = abs(sin(fi * 39.3468 + 11.135))
                let normalized = (r - innerRadius) / (outerRadius - innerRadius)
                // Bratul ramane CONTINUU pe interior; doar varful se rarefiaza.
                if normalized > 0.7, h1 > 1.55 - normalized { r += step; j += 1; continue }
                let angle = baseAngle + (r - innerRadius) * twist
                // Interiorul e estompat: opacitatea creste de la ~0 langa
                // logo pana la varf spre mijloc, apoi scade spre exterior.
                let innerFade = min(1, normalized / 0.3)
                let falloff = max(0.08, 0.8 - normalized * 0.68) * innerFade
                result.append(Dot(
                    radius: CGFloat(r),
                    angle: CGFloat(angle),
                    size: CGFloat(1.0 + h2 * 0.8),
                    alpha: CGFloat(falloff * (0.7 + h1 * 0.3)),
                    delay: h2 * 0.4
                ))
                r += step
                j += 1
            }
        }
        return result
    }()

    /// Deseneaza vortexul la progresul dat (0 = imprastiat/transparent,
    /// 1 = aranjamentul final). Fiecare punct vine din exterior (radial, cu o
    /// mica rasucire) si apare din transparent, cu delay propriu.
    private static func drawVortex(_ ctx: GraphicsContext, size: CGSize, progress: Double) {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        for dot in dots {
            // Progresul PUNCTULUI: porneste dupa delay-ul lui, dureaza restul.
            let span = max(0.15, 1 - dot.delay)
            let local = min(max((progress - dot.delay) / span, 0), 1)
            guard local > 0 else { continue }
            let eased = 1 - pow(1 - local, 3) // ease-out cubic

            let radius = dot.radius + (1 - eased) * 110 // vine din exterior
            let angle = dot.angle - (1 - eased) * 0.55 // se rasuceste la loc
            let x = center.x + cos(angle) * radius
            let y = center.y + sin(angle) * radius
            let rect = CGRect(
                x: x - dot.size / 2, y: y - dot.size / 2,
                width: dot.size, height: dot.size)
            ctx.fill(
                Path(ellipseIn: rect),
                // Helixul intreg sta la 60% — discret sub logo.
                with: .color(.white.opacity(dot.alpha * eased * 0.6)))
        }
    }
}

#Preview {
    SplashView()
}
