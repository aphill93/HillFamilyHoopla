import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var rememberMe: Bool = false
    @State private var showForgotPassword: Bool = false
    @State private var showRegister: Bool = false
    @FocusState private var focusedField: Field?

    enum Field: Hashable { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    Spacer(minLength: 60)

                    // ── Branding ─────────────────────────────────────────────
                    VStack(spacing: 8) {
                        Image(systemName: "calendar.circle.fill")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 72, height: 72)
                            .foregroundStyle(.blue)

                        Text("HillFamilyHoopla")
                            .font(.largeTitle.bold())
                            .foregroundStyle(.primary)

                        Text("Sign in to your family account")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    // ── Form ─────────────────────────────────────────────────
                    VStack(spacing: 16) {
                        // Error banner
                        if let error = authViewModel.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red)
                                Text(error)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                Spacer()
                                Button { authViewModel.clearError() } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding()
                            .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                        }

                        // Email field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Email address")
                                .font(.subheadline.weight(.medium))
                            TextField("you@example.com", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                                .focused($focusedField, equals: .email)
                                .padding()
                                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                                .submitLabel(.next)
                                .onSubmit { focusedField = .password }
                        }

                        // Password field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password")
                                .font(.subheadline.weight(.medium))
                            SecureField("••••••••", text: $password)
                                .textContentType(.password)
                                .focused($focusedField, equals: .password)
                                .padding()
                                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                                .submitLabel(.go)
                                .onSubmit { Task { await submit() } }
                        }

                        // Remember me + forgot password
                        HStack {
                            Toggle(isOn: $rememberMe) {
                                Text("Remember me")
                                    .font(.subheadline)
                            }
                            .toggleStyle(CheckboxToggleStyle())

                            Spacer()

                            Button("Forgot password?") {
                                showForgotPassword = true
                            }
                            .font(.subheadline)
                            .foregroundStyle(.blue)
                        }

                        // Sign in button
                        Button {
                            Task { await submit() }
                        } label: {
                            Group {
                                if authViewModel.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Sign in")
                                        .font(.body.weight(.semibold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)
                        .controlSize(.large)
                    }
                    .padding()
                    .background(.background, in: RoundedRectangle(cornerRadius: 16))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)

                    // Create account link
                    HStack(spacing: 4) {
                        Text("Don't have an account?")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Create account") { showRegister = true }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.blue)
                    }

                    Spacer()
                }
                .padding()
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(Color(.systemGroupedBackground))
            .navigationBarHidden(true)
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordView()
                .environmentObject(authViewModel)
        }
        .sheet(isPresented: $showRegister) {
            RegisterView()
                .environmentObject(authViewModel)
        }
    }

    private func submit() async {
        focusedField = nil
        await authViewModel.login(email: email, password: password, rememberMe: rememberMe)
    }
}

// ─── Checkbox toggle style ────────────────────────────────────────────────────

struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .foregroundStyle(configuration.isOn ? .blue : .secondary)
                configuration.label
            }
        }
        .buttonStyle(.plain)
    }
}

// ─── Forgot password sheet ────────────────────────────────────────────────────

struct ForgotPasswordView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var email: String = ""
    @State private var sent: Bool = false
    @State private var isSending: Bool = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if sent {
                    Image(systemName: "envelope.circle.fill")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 64)
                        .foregroundStyle(.green)

                    Text("Check your inbox")
                        .font(.title2.bold())

                    Text("If \(email) is registered, you'll receive a password reset link shortly.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)

                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)

                } else {
                    Text("Enter your email address and we'll send you a link to reset your password.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)

                    TextField("Email address", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding()
                        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))

                    Button {
                        Task {
                            isSending = true
                            let ok = await authViewModel.forgotPassword(email: email)
                            isSending = false
                            if ok { sent = true }
                        }
                    } label: {
                        Group {
                            if isSending {
                                ProgressView().tint(.white)
                            } else {
                                Text("Send reset link")
                                    .font(.body.weight(.semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSending || email.isEmpty)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
