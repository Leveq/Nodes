import { GunInstanceManager } from "./gun-instance";
import { ProfileCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { FieldVisibility } from "@nodes/core";

/**
 * ProfileManager handles reading and writing user profile data
 * in the GunJS user graph.
 *
 * This is the core of the self-sovereign identity model:
 * - Profile data is stored in the USER'S OWN graph
 * - Data is signed by the user's keypair (authenticity)
 * - Fields can be encrypted per visibility settings (privacy)
 * - Other users read the profile by resolving the public key soul
 *
 * See Architecture Spec Section 2.7
 */

export interface ProfileData {
  displayName: string;
  bio: string;
  avatar: string; // IPFS CID or empty string
  banner: string; // IPFS CID or empty string
  status: string;
  visibility: "public" | "private"; // Account-level visibility
}

export interface ProfileFieldConfig {
  field: keyof ProfileData;
  visibility: FieldVisibility;
}

export interface ProfileWithVisibility {
  data: ProfileData;
  fieldVisibility: Record<keyof ProfileData, FieldVisibility>;
}

export class ProfileManager {
  private crypto: ProfileCrypto;

  constructor() {
    this.crypto = new ProfileCrypto();
  }

  /**
   * Create or update the user's profile in their own GunJS graph.
   * Each field is individually processed based on its visibility setting.
   */
  async saveProfile(
    profile: ProfileWithVisibility,
    keypair: KeyPair,
  ): Promise<void> {
    const user = GunInstanceManager.user();

    // Store each field with its visibility setting
    for (const [field, value] of Object.entries(profile.data)) {
      const visibility =
        profile.fieldVisibility[field as keyof ProfileData] || "public";

      // Encrypt field based on visibility
      const processedValue = await this.crypto.encryptField(
        String(value),
        visibility,
        keypair,
      );

      // Store the field value and its visibility metadata
      user.get("profile").get(field).put(processedValue);
      user.get("profile").get("_visibility").get(field).put(visibility);
    }

    // Store the account-level visibility setting (always public so others know the account type)
    user.get("profile").get("_accountType").put(profile.data.visibility);

    // Store the epub (encryption public key) so others can send us encrypted DMs
    // This is always public - needed for ECDH key exchange
    user.get("profile").get("_epub").put(keypair.epub);

    // Store a timestamp of last profile update
    user.get("profile").get("_updatedAt").put(Date.now());
  }

  /**
   * Read the current user's own profile from their graph.
   * Since it's our own data, we have all decryption keys.
   */
  async getOwnProfile(keypair: KeyPair): Promise<ProfileWithVisibility | null> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user.get("profile").once(async (data: any) => {
        if (!data) {
          resolve(null);
          return;
        }

        const fields: (keyof ProfileData)[] = [
          "displayName",
          "bio",
          "avatar",
          "banner",
          "status",
          "visibility",
        ];

        const profileData: Record<string, string> = {};
        const fieldVisibility: Partial<
          Record<keyof ProfileData, FieldVisibility>
        > = {};

        for (const field of fields) {
          const rawValue = data[field] as string | undefined;
          const visibilityData = data._visibility as Record<string, string> | undefined;
          const vis = (visibilityData?.[field] || "public") as FieldVisibility;

          fieldVisibility[field] = vis;

          if (rawValue) {
            try {
              profileData[field] = await this.crypto.decryptField(
                rawValue,
                vis,
                keypair,
              );
            } catch {
              profileData[field] = rawValue;
            }
          } else {
            profileData[field] = "";
          }
        }

        resolve({
          data: profileData as unknown as ProfileData,
          fieldVisibility: fieldVisibility as Record<
            keyof ProfileData,
            FieldVisibility
          >,
        });
      });
    });
  }

  /**
   * Read another user's profile by their public key.
   * This is the core "user serves their own data" flow:
   *
   * 1. Resolve the target's public key in the Gun graph
   * 2. Traverse to their profile/ sub-graph
   * 3. Read each field, decrypting only if we have the key
   * 4. Return what we can see based on visibility
   */
  async getPublicProfile(
    publicKey: string,
  ): Promise<Partial<ProfileData> | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      gun
        .user(publicKey)
        .get("profile")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once(async (data: any) => {
          if (!data) {
            resolve(null);
            return;
          }

          const fields: (keyof ProfileData)[] = [
            "displayName",
            "bio",
            "avatar",
            "banner",
            "status",
            "visibility",
          ];

          const profileData: Record<string, string> = {};
          const accountType = (data._accountType as string) || "public";

          for (const field of fields) {
            const rawValue = data[field] as string | undefined;
            const visibilityData = data._visibility as Record<string, string> | undefined;
            const vis = visibilityData?.[field] || "public";

            // We can only read public fields of other users without a shared key
            if (vis === "public" && rawValue) {
              profileData[field] = rawValue;
            }
            // For non-public fields, we'd need a shared key (implemented in Milestone 1.6)
            // For now, these fields are simply not included in the response
          }

          // Always include account type so UI knows to show "Request Access" for private accounts
          profileData.visibility = accountType;

          resolve(profileData as unknown as Partial<ProfileData>);
        });
    });
  }

  /**
   * Update a single profile field.
   */
  async updateField(
    field: keyof ProfileData,
    value: string,
    visibility: FieldVisibility,
    keypair: KeyPair,
  ): Promise<void> {
    const user = GunInstanceManager.user();
    const processedValue = await this.crypto.encryptField(
      value,
      visibility,
      keypair,
    );

    user.get("profile").get(field).put(processedValue);
    user.get("profile").get("_visibility").get(field).put(visibility);
    user.get("profile").get("_updatedAt").put(Date.now());
  }
}
