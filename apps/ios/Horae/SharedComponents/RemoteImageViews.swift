import SwiftUI

// MARK: - Recipe photo

/// Recipe photo loaded from a RELATIVE API path. While loading, on failure or
/// without a photo it shows a tinted square with the recipe initial (as on web).
struct RecipePhotoView: View {
    let photoUrl: String?
    let name: String
    var cornerRadius: CGFloat = AppTheme.CornerRadius.lg
    var initialFont: Font = .largeTitle

    var body: some View {
        ZStack {
            placeholder
            if let url = APIClient.absoluteURL(for: photoUrl) {
                AsyncImage(url: url, transaction: Transaction(animation: .smooth)) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity)
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(photoUrl == nil ? "Fara poza" : "Poza \(name)")
    }

    private var placeholder: some View {
        Rectangle()
            .fill(AppTheme.Colors.primary.opacity(0.15))
            .overlay {
                Text(initial)
                    .font(initialFont.weight(.semibold))
                    .foregroundStyle(AppTheme.Colors.primary)
            }
    }

    private var initial: String {
        name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased()
    }
}

// MARK: - User avatar

/// Circular user avatar from a RELATIVE API path with an initials fallback.
struct UserAvatarView: View {
    let avatarUrl: String?
    let firstName: String
    let lastName: String
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            Circle().fill(AppTheme.Colors.primary)
            Text(initials)
                .font(size >= 56 ? .title2.bold() : .caption.bold())
                .foregroundStyle(.white)
                .minimumScaleFactor(0.5)
            if let url = APIClient.absoluteURL(for: avatarUrl) {
                AsyncImage(url: url, transaction: Transaction(animation: .smooth)) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var initials: String {
        "\(firstName.prefix(1))\(lastName.prefix(1))".uppercased()
    }
}

#Preview("Recipe photo placeholder") {
    RecipePhotoView(photoUrl: nil, name: "Ecler cu vanilie")
        .aspectRatio(16 / 9, contentMode: .fit)
        .padding()
}

#Preview("Avatar initials") {
    UserAvatarView(avatarUrl: nil, firstName: "Ana", lastName: "Pop", size: 72)
}
