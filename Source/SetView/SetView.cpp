#include "SetView.h"

DEFINE_LOG_CATEGORY(LogSetView);

void FSetViewModule::StartupModule()
{
	UE_LOG(LogSetView, Log, TEXT("SetView Virtual Production Module Initialized."));
}

void FSetViewModule::ShutdownModule()
{
	UE_LOG(LogSetView, Log, TEXT("SetView Virtual Production Module Shutdown."));
}

IMPLEMENT_PRIMARY_GAME_MODULE(FSetViewModule, SetView, "SetView");
