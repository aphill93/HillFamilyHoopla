import SwiftUI

// ─── Profile color picker ─────────────────────────────────────────────────────

private struct ProfileColorOption: Identifiable {
    let id: String  // hex
    let label: String
    var color: Color { Color(hex: id) ?? .blue }
}

private let memberColors: [ProfileColorOption] = [
    .init(id: "#EF4444", label: "Red"),
    .init(id: "#F97316", label: "Orange"),
    .init(id: "#EAB308", label: "Yellow"),
    .init(id: "#22C55E", label: "Green"),
    .init(id: "#3B82F6", label: "Blue"),
    .init(id: "#8B5CF6", label: "Violet"),
    .init(id: "#EC4899", label: "Pink"),
    .init(id: "#14B8A6", label: "Teal"),
]

// ─── Register View ────────────────────────────────────────────────────────────

struct RegisterView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var name:            String = ""
    @State private var email:           String = ""
    @State private var password:        String = ""
    @State private var confirmPassword: String = ""
    @State private var profileColor:    String = ""
    @State private var inviteCode:      String = ""
    @State private var showInviteCode:  Bool   = false
    @State private var showPassword:    Bool   = false
    @State private var registered:      Bool   = false

    @FocusState private var focusedField: Field?
    enum Field: Hashable { case name, email, password, confirmPassword, inviteCode }

    // ── Validation ────────────────────────────────────────────────────────────

    private var passwordStrength: (score: Int, label: String, color: Color) {
        var score = 0
        if password.count >= 8                              { score += 1 }
        if password.range(of: "[A-Z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[0-9]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil { score += 1 }
        let labels = ["", "Weak", "Fair", "Good", "Strong"]
        let colors: [Color] = [.clear, .red, .orange, .yellow, .green]
        return (score, labels[score], colors[score])
    }

    private var canSubmit: Bool {
        !name.isEmpty && !email.isEmpty &&
        password.count >= 8 && password == confirmPassword &&
        !profileColor.isEmpty && !authViewModel.isLoading
    }

    // ── Body ──────────────────────────────────────────────────────────────────

    var body: some View {
        NavigationStack {
            if registered {
                successView
            } else {
                formView
            }
        }
    }

    // ── Success screen ────────────────────────────────────────────────────────

    private var successView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "envelope.circle.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 72)
                .foregroundStyle(.green)

            Text("Check your inbox")
                .font(.title.bold())

            Text("We sent a verification link to **\(email)**.\nTap the link to activate your account.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Back to sign in") { dismiss() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

            Spacer()
        }
        .padding()
        .navigationTitle("Account Created")
        .navigationBarTitleDisplayMode(.inline)
    }

    // ── Registration form ─────────────────────────────────────────────────────

    private var formView: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Error banner
                if let error = authViewModel.errorMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                        Text(error).font(.footnote).foregroundStyle(.red)
                        Spacer()
                        Button { authViewModel.clearError() } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                    .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }

                // ── Name ──────────────────────────────────────────────────────
                fieldLabel("Full name")
                TextField("Jane Hill", text: $name)
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .email }
                    .textFieldStyle()

                // ── Email ─────────────────────────────────────────────────────
                fieldLabel("Email address")
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .textFieldStyle()

                // ── Password ──────────────────────────────────────────────────
                fieldLabel("Password")
                ZStack(alignment: .trailing) {
                    Group {
                        if showPassword {
                            TextField("••••••••", text: $password)
                        } else {
                            SecureField("••••••••", text: $password)
                        }
                    }
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .confirmPassword }
                    .textFieldStyle()
                    .padding(.trailing, 40)

                    Button { showPassword.toggle() } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 12)
                }

                if !password.isEmpty {
                    passwordStrengthBar
                }

                // ── Confirm password ──────────────────────────────────────────
                fieldLabel("Confirm password")
                SecureField("••••••••", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .confirmPassword)
                    .submitLabel(.next)
                    .textFieldStyle()

                if !confirmPassword.isEmpty && password != confirmPassword {
                    Text("Passwords do not match")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // ── Profile color ─────────────────────────────────────────────
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your calendar color")
                        .font(.subheadline.weight(.medium))

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                        ForEach(memberColors) { option in
                            Button {
                                profileColor = option.id
                            } label: {
                                Circle()
                                    .fill(option.color)
                                    .frame(width: 36, height: 36)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(profileColor == option.id ? .primary : .clear, lineWidth: 2.5)
                                            .padding(-3)
                                    )
                                    .scaleEffect(profileColor == option.id ? 1.15 : 1.0)
                                    .animation(.spring(response: 0.25), value: profileColor)
                            }
                            .accessibilityLabel(option.label)
                        }
                    }
                }

                // ── Invite code (optional) ────────────────────────────────────
                Button {
                    withAnimation { showInviteCode.toggle() }
                } label: {
                    Label(
                        showInviteCode ? "Hide invite code" : "Have an invite code?",
                        systemImage: showInviteCode ? "chevron.up" : "chevron.down"
                    )
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if showInviteCode {
                    TextField("Invite code", text: $inviteCode)
                        .textContentType(.oneTimeCode)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($focusedField, equals: .inviteCode)
                        .textFieldStyle()
                }

                // ── Submit ────────────────────────────────────────────────────
                Button {
                    Task { await submit() }
                } label: {
                    Group {
                        if authViewModel.isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Create account").font(.body.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit)
                .controlSize(.large)
            }
            .padding()
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Create Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    // ── Password strength bar ─────────────────────────────────────────────────

    private var passwordStrengthBar: some View {
        let (score, label, color) = passwordStrength
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                ForEach(1..<5) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i <= score ? color : Color(.systemGray5))
                        .frame(height: 4)
                }
            }
            Text("Strength: \(label)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @ViewBuilder
    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func submit() async {
        focusedField = nil
        let success = await authViewModel.register(
            email: email,
            password: password,
            name: name,
            profileColor: profileColor,
            inviteCode: inviteCode.isEmpty ? nil : inviteCode
        )
        if success { registered = true }
    }
}

// ─── TextField style modifier ─────────────────────────────────────────────────

private extension View {
    func textFieldStyle() -> some View {
        self
            .padding()
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }
}

// ─── Color hex init ───────────────────────────────────────────────────────────

extension Color {
    init?(hex: String) {
        var str = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if str.hasPrefix("#") { str = String(str.dropFirst()) }
        guard str.count == 6, let value = UInt64(str, radix: 16) else { return nil }
        self.init(
            red:   Double((value >> 16) & 0xFF) / 255,
            green: Double((value >>  8) & 0xFF) / 255,
            blue:  Double( value        & 0xFF) / 255
        )
    }
}
