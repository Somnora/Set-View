using UnrealBuildTool;

public class SetView : ModuleRules
{
	public SetView(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"HeadMountedDisplay",
			"CinematicCamera",
			"ProceduralMeshComponent",
			"Json",
			"JsonUtilities",
			"Networking",
			"Sockets",
			"LiveLinkInterface",
			"LiveLinkCamera",
			"LevelSequence",
			"MovieScene"
		});

		PrivateDependencyModuleNames.AddRange(new string[] {
			"Projects",
			"RenderCore",
			"RHI"
		});

		if (Target.bBuildEditor)
		{
			PrivateDependencyModuleNames.AddRange(new string[] {
				"UnrealEd",
				"EditorScriptingUtilities",
				"LevelSequenceEditor"
			});
		}
	}
}
